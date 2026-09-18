import type { Db } from '@/db';
import { inArray } from 'drizzle-orm';
import { teamMember } from '@/db/schema';
import {
   listStatuses,
   listProjectStatuses,
   listPriorities,
   listLabels,
   listHealthStates,
} from './catalogs';
import { listTeams, type TeamDto } from './teams';
import { listProjects, type ProjectDto } from './projects';
import { listMembers, type MemberDto } from './members';
import { listInitiatives, type InitiativeDto } from './initiatives';
import { listViews, type ViewDto } from './views';
import { listCyclesForTeams, rolloverCyclesForTeam, type CycleDto } from './cycles';
import { getMe, type MeDto } from './users';
import { visibleTeamIds } from './scope';
import { snapshotProjects } from './project-snapshots';

/** Time do bootstrap: TeamDto + membros. Projetos NÃO vêm aqui (bootstrap enxuto): o
 * cliente deriva de `projects` pelo `teamId`, sem a cópia duplicada. */
export interface TeamFull extends TeamDto {
   members: MemberDto[];
}

export interface WorkspaceBootstrap {
   me: MeDto;
   statuses: Awaited<ReturnType<typeof listStatuses>>;
   projectStatuses: Awaited<ReturnType<typeof listProjectStatuses>>;
   priorities: Awaited<ReturnType<typeof listPriorities>>;
   labels: Awaited<ReturnType<typeof listLabels>>;
   healthStates: Awaited<ReturnType<typeof listHealthStates>>;
   teams: TeamFull[];
   projects: ProjectDto[];
   members: MemberDto[];
   cycles: CycleDto[];
   initiatives: InitiativeDto[];
   views: ViewDto[];
}

const housekeepingDays = new WeakMap<object, Map<string, string>>();

function claimHousekeeping(db: Db, teamId: string, day: string): boolean {
   let days = housekeepingDays.get(db as object);
   if (!days) {
      days = new Map();
      housekeepingDays.set(db as object, days);
   }
   if (days.get(teamId) === day) return false;
   days.set(teamId, day);
   return true;
}

function releaseHousekeeping(db: Db, teamId: string, day: string): void {
   const days = housekeepingDays.get(db as object);
   if (days?.get(teamId) === day) days.delete(teamId);
}

/**
 * Uma chamada: toda a referência do workspace, costurada server-side.
 * `rollover` (default true) faz o auto-rollover lazy de cycles. Refetches disparados
 * pelo SSE passam `false` — o rollover é housekeeping de load, não precisa rodar (a
 * ESCRITA) a cada evento; só no boot genuíno da página.
 */
export async function bootstrapWorkspace(
   db: Db,
   email: string,
   opts: { rollover?: boolean } = {}
): Promise<WorkspaceBootstrap> {
   const me = await getMe(db, email);
   // Escopo de Guest (#100): resolvido UMA vez e propagado a todas as listagens —
   // o convidado só enxerga os times de que participa (e seus sub-times).
   const teamScope = await visibleTeamIds(db, me);
   const scopedTeamIds = teamScope ?? undefined;

   const [
      statuses,
      projectStatuses,
      priorities,
      labels,
      healthStates,
      teams,
      projects,
      members,
      initiatives,
      views,
   ] = await Promise.all([
      listStatuses(db),
      listProjectStatuses(db),
      listPriorities(db),
      listLabels(db),
      listHealthStates(db),
      listTeams(db, { teamIds: scopedTeamIds }, me.id),
      listProjects(db, { teamIds: scopedTeamIds }),
      // Hidratação do workspace: pede os desativados EXPLICITAMENTE (default do
      // serviço agora é escondê-los). A UI precisa deles para renderizar autoria e
      // atribuição histórica, e para o filtro "Show deactivated" da tela de membros.
      listMembers(db, { teamIds: scopedTeamIds, includeDeactivated: true }),
      listInitiatives(db, { teamIds: scopedTeamIds }),
      // Views escopadas: compartilhadas (com time) + as pessoais do próprio usuário.
      listViews(db, undefined, me.id, scopedTeamIds),
   ]);

   // membros por time (bulk)
   const memberById = new Map(members.map((m) => [m.id, m]));
   const links = scopedTeamIds
      ? scopedTeamIds.length
         ? await db.select().from(teamMember).where(inArray(teamMember.teamId, scopedTeamIds))
         : []
      : await db.select().from(teamMember);
   const membersByTeam = new Map<string, MemberDto[]>();
   for (const l of links) {
      const m = memberById.get(l.userId);
      if (!m) continue;
      const arr = membersByTeam.get(l.teamId) ?? [];
      arr.push(m);
      membersByTeam.set(l.teamId, arr);
   }
   const teamsFull: TeamFull[] = teams.map((t) => ({
      ...t,
      members: membersByTeam.get(t.id) ?? [],
   }));

   // Auto-rollover lazy (#24): o app não tem scheduler, então o bootstrap fecha os
   // cycles vencidos e migra as issues em aberto ANTES de listar. Idempotente; roda
   // por time em paralelo. (Sem isto o rollover ficava morto — nenhum outro caminho
   // da UI o dispara.) Pulado em refetch de SSE (`rollover:false`) — não repetir a
   // escrita a cada evento; o boot da página já cobre.
   const teamIds = teams.map((t) => t.id);
   if (opts.rollover !== false) {
      const day = new Date().toISOString().slice(0, 10);
      const housekeepingTeams: string[] = [];
      for (const id of teamIds) {
         if (!claimHousekeeping(db, id, day)) continue;
         try {
            await rolloverCyclesForTeam(db, id);
            housekeepingTeams.push(id);
         } catch (error) {
            releaseHousekeeping(db, id, day);
            throw error;
         }
      }
      // Roadmap (#102): o snapshot diário do projeto também é lazy — o boot grava o
      // dia (upsert idempotente) uma vez por time e por pod.
      if (housekeepingTeams.length > 0) {
         const scope = new Set(housekeepingTeams);
         await snapshotProjects(
            db,
            projects.filter((project) => scope.has(project.teamId)).map((project) => project.id)
         );
      }
   }

   // cycles de todos os times — 2 queries no total (era N+1: 1 chamada por time,
   // cada uma re-escaneando a tabela status). Burnup só do current (bootstrap enxuto);
   // o dos demais vem sob demanda em `GET /cycles/:id`.
   const cycles: CycleDto[] = await listCyclesForTeams(db, teamIds, { burnup: 'current' });

   return {
      me,
      statuses,
      projectStatuses,
      priorities,
      labels,
      healthStates,
      teams: teamsFull,
      projects,
      members,
      cycles,
      initiatives,
      views,
   };
}
