import { inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import { teamMember, cycle as cycleT } from '@/db/schema';
import { listStatuses, listPriorities, listLabels, listHealthStates } from './catalogs';
import { listTeams, type TeamDto } from './teams';
import { listProjects, type ProjectDto } from './projects';
import { listMembers, type MemberDto } from './members';
import { listInitiatives, type InitiativeDto } from './initiatives';
import { listViews, type ViewDto } from './views';
import { listCyclesByTeam, type CycleDto } from './cycles';
import { getMe, type MeDto } from './users';

export interface TeamFull extends TeamDto {
   members: MemberDto[];
   projects: ProjectDto[];
}

export interface WorkspaceBootstrap {
   me: MeDto;
   statuses: Awaited<ReturnType<typeof listStatuses>>;
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
      listPriorities(db),
      listLabels(db),
      listHealthStates(db),
      listTeams(db, {}, me.id),
      listProjects(db, {}),
      listMembers(db, {}),
      listInitiatives(db, {}),
      listViews(db),
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

   // cycles de todos os times
   const teamIds = teams.map((t) => t.id);
   const cycles: CycleDto[] = [];
   if (teamIds.length) {
      const allCycleRows = await db
         .select({ id: cycleT.id, teamId: cycleT.teamId })
         .from(cycleT)
         .where(inArray(cycleT.teamId, teamIds));
      const uniqueTeams = [...new Set(allCycleRows.map((c) => c.teamId))];
      const perTeam = await Promise.all(uniqueTeams.map((tid) => listCyclesByTeam(db, tid)));
      for (const c of perTeam) cycles.push(...c);
   }

   return {
      me,
      statuses,
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
