import { eq, count, and } from 'drizzle-orm';
import type { Db } from '@/db';
import { team as teamT, teamMember, appUser, project as projectT } from '@/db/schema';
import { getOrCreateUser } from './users';
import { ApiError } from './errors';

type TeamRow = typeof teamT.$inferSelect;

export interface TeamDto {
   id: string;
   name: string;
   icon: string | null;
   color: string | null;
   memberCount: number;
   projectCount: number;
   joined: boolean;
}

export type TeamSort = 'name' | 'members' | 'projects';

async function countsByTeam(db: Db) {
   const [memberCounts, projectCounts] = await Promise.all([
      db
         .select({ teamId: teamMember.teamId, n: count() })
         .from(teamMember)
         .groupBy(teamMember.teamId),
      db.select({ teamId: projectT.teamId, n: count() }).from(projectT).groupBy(projectT.teamId),
   ]);
   return {
      members: new Map(memberCounts.map((r) => [r.teamId, Number(r.n)])),
      projects: new Map(projectCounts.map((r) => [r.teamId, Number(r.n)])),
   };
}

async function joinedTeamIds(db: Db, userId?: string): Promise<Set<string>> {
   if (!userId) return new Set();
   const rows = await db
      .select({ teamId: teamMember.teamId })
      .from(teamMember)
      .where(eq(teamMember.userId, userId));
   return new Set(rows.map((r) => r.teamId));
}

function toDto(
   t: TeamRow,
   counts: { members: Map<string, number>; projects: Map<string, number> },
   joined: Set<string>
): TeamDto {
   return {
      id: t.id,
      name: t.name,
      icon: t.icon,
      color: t.color,
      memberCount: counts.members.get(t.id) ?? 0,
      projectCount: counts.projects.get(t.id) ?? 0,
      joined: joined.has(t.id),
   };
}

export interface ListTeamsOptions {
   membership?: string[]; // 'Joined' | 'Not-Joined'
   sort?: TeamSort;
   dir?: 'asc' | 'desc';
}

export async function listTeams(
   db: Db,
   opts: ListTeamsOptions = {},
   meId?: string
): Promise<TeamDto[]> {
   const [teams, counts, joined] = await Promise.all([
      db.select().from(teamT),
      countsByTeam(db),
      joinedTeamIds(db, meId),
   ]);
   let dtos = teams.map((t) => toDto(t, counts, joined));

   if (opts.membership?.length) {
      const wantJoined = opts.membership.includes('Joined');
      const wantNot = opts.membership.includes('Not-Joined');
      dtos = dtos.filter((d) => (d.joined && wantJoined) || (!d.joined && wantNot));
   }

   const dir = opts.dir === 'desc' ? -1 : 1;
   const by = opts.sort ?? 'name';
   dtos.sort((a, b) => {
      const cmp =
         by === 'members'
            ? a.memberCount - b.memberCount
            : by === 'projects'
              ? a.projectCount - b.projectCount
              : a.name.localeCompare(b.name);
      return cmp * dir;
   });
   return dtos;
}

export async function getTeam(db: Db, id: string, meId?: string): Promise<TeamDto | null> {
   const rows = await db.select().from(teamT).where(eq(teamT.id, id)).limit(1);
   if (rows.length === 0) return null;
   const [counts, joined] = await Promise.all([countsByTeam(db), joinedTeamIds(db, meId)]);
   return toDto(rows[0], counts, joined);
}

export async function listTeamMembers(db: Db, teamId: string) {
   return db
      .select({
         id: appUser.id,
         slug: appUser.slug,
         name: appUser.name,
         email: appUser.email,
         avatarUrl: appUser.avatarUrl,
         role: appUser.role,
      })
      .from(teamMember)
      .innerJoin(appUser, eq(teamMember.userId, appUser.id))
      .where(eq(teamMember.teamId, teamId));
}

export interface CreateTeamInput {
   id: string;
   name: string;
   icon?: string | null;
   color?: string | null;
}

/** Cria um time. A key (id) vira o prefixo do identifier das issues (<KEY>-<n>). */
export async function createTeam(db: Db, input: CreateTeamInput): Promise<TeamDto> {
   const id = input.id.trim().toUpperCase();
   if (!/^[A-Z][A-Z0-9]{1,15}$/.test(id))
      throw new ApiError(
         400,
         "Key inválida (2-16 letras/números começando por letra, ex.: 'CORE')"
      );
   const existing = await db.select({ id: teamT.id }).from(teamT).where(eq(teamT.id, id)).limit(1);
   if (existing.length) throw new ApiError(409, `Team '${id}' já existe`);
   await db.insert(teamT).values({
      id,
      name: input.name.trim(),
      icon: input.icon?.trim() || '📋',
      color: input.color?.trim() || '#6e7bdb',
      issueSeq: 0,
   });
   return (await getTeam(db, id))!;
}

/** Adiciona (idempotente) um membro ao time pelo e-mail — provisiona o usuário se novo. */
export async function addTeamMember(db: Db, teamId: string, email: string): Promise<void> {
   const t = await db.select({ id: teamT.id }).from(teamT).where(eq(teamT.id, teamId)).limit(1);
   if (!t.length) throw new ApiError(404, `Team '${teamId}' não existe`);
   const user = await getOrCreateUser(db, email);
   await db
      .insert(teamMember)
      .values({ teamId, userId: user.id, joined: true })
      .onConflictDoNothing();
}

/** Remove um membro do time. */
export async function removeTeamMember(db: Db, teamId: string, userId: string): Promise<void> {
   await db
      .delete(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)));
}
