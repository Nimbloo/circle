import type { Db } from '@/db';
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

export interface TeamFull extends TeamDto {
   members: MemberDto[];
   projects: ProjectDto[];
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

/** Uma chamada: toda a referência do workspace, costurada server-side. */
export async function bootstrapWorkspace(db: Db, email: string): Promise<WorkspaceBootstrap> {
   const me = await getMe(db, email);

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
      listTeams(db, {}, me.id),
      listProjects(db, {}),
      listMembers(db, {}),
      listInitiatives(db, {}),
      // Views escopadas: compartilhadas (com time) + as pessoais do próprio usuário.
      listViews(db, undefined, me.id),
   ]);

   // membros por time (bulk)
   const memberById = new Map(members.map((m) => [m.id, m]));
   const links = await db.select().from(teamMember);
   const membersByTeam = new Map<string, MemberDto[]>();
   for (const l of links) {
      const m = memberById.get(l.userId);
      if (!m) continue;
      const arr = membersByTeam.get(l.teamId) ?? [];
      arr.push(m);
      membersByTeam.set(l.teamId, arr);
   }
   const projectsByTeam = new Map<string, ProjectDto[]>();
   for (const p of projects) {
      const arr = projectsByTeam.get(p.teamId) ?? [];
      arr.push(p);
      projectsByTeam.set(p.teamId, arr);
   }
   const teamsFull: TeamFull[] = teams.map((t) => ({
      ...t,
      members: membersByTeam.get(t.id) ?? [],
      projects: projectsByTeam.get(t.id) ?? [],
   }));

   // Auto-rollover lazy (#24): o app não tem scheduler, então o bootstrap fecha os
   // cycles vencidos e migra as issues em aberto ANTES de listar. Idempotente; roda
   // por time em paralelo. (Sem isto o rollover ficava morto — nenhum outro caminho
   // da UI o dispara.)
   const teamIds = teams.map((t) => t.id);
   await Promise.all(teamIds.map((id) => rolloverCyclesForTeam(db, id)));

   // cycles de todos os times — 2 queries no total (era N+1: 1 chamada por time,
   // cada uma re-escaneando a tabela status).
   const cycles: CycleDto[] = await listCyclesForTeams(db, teamIds);

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
