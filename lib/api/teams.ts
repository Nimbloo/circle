import { eq, count, and } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   team as teamT,
   teamMember,
   appUser,
   project as projectT,
   issue as issueT,
   cycle as cycleT,
} from '@/db/schema';
import { getOrCreateUser } from './users';
import { sendEmail } from './integrations/mailer';
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
   const t = await db
      .select({ id: teamT.id, name: teamT.name })
      .from(teamT)
      .where(eq(teamT.id, teamId))
      .limit(1);
   if (!t.length) throw new ApiError(404, `Team '${teamId}' não existe`);
   const user = await getOrCreateUser(db, email);
   const inserted = await db
      .insert(teamMember)
      .values({ teamId, userId: user.id, joined: true })
      .onConflictDoNothing()
      .returning();

   // Convite por e-mail (best-effort): só dispara em inserção nova e quando o
   // remetente está configurado (CIRCLE_MAIL_FROM). Nunca quebra o fluxo.
   if (inserted.length && process.env.CIRCLE_MAIL_FROM) {
      try {
         const team = t[0];
         const html =
            `<p>Você foi adicionado ao time <strong>${team.name}</strong> no Circle.</p>` +
            `<p><a href="https://circle.nimbloo.ai">Acessar o Circle</a></p>`;
         await sendEmail(user.email, `Convite: ${team.name} no Circle`, html);
      } catch (err) {
         console.error('[circle] convite por e-mail falhou:', err);
      }
   }
}

/** Remove um membro do time. */
export async function removeTeamMember(db: Db, teamId: string, userId: string): Promise<void> {
   await db
      .delete(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)));
}

export interface UpdateTeamInput {
   name?: string;
   icon?: string | null;
   color?: string | null;
}

/** Atualização parcial (name/icon/color). Retorna o TeamDto ou null se não existir. */
export async function updateTeam(
   db: Db,
   id: string,
   patch: UpdateTeamInput
): Promise<TeamDto | null> {
   const existing = await db.select({ id: teamT.id }).from(teamT).where(eq(teamT.id, id)).limit(1);
   if (existing.length === 0) return null;
   const set: Record<string, unknown> = {};
   if (patch.name !== undefined) set.name = patch.name.trim();
   if (patch.icon !== undefined) set.icon = patch.icon;
   if (patch.color !== undefined) set.color = patch.color;
   if (Object.keys(set).length) await db.update(teamT).set(set).where(eq(teamT.id, id));
   return getTeam(db, id);
}

/**
 * Apaga um time. Escolha segura: recusa com 409 se o time tiver issues, projects
 * ou cycles (evita órfãos). Se estiver vazio, remove os team_member e o team.
 * Retorna false se o time não existir.
 */
export async function deleteTeam(db: Db, id: string): Promise<boolean> {
   const existing = await db.select({ id: teamT.id }).from(teamT).where(eq(teamT.id, id)).limit(1);
   if (existing.length === 0) return false;

   const [issues, projects, cycles] = await Promise.all([
      db.select({ n: count() }).from(issueT).where(eq(issueT.teamId, id)),
      db.select({ n: count() }).from(projectT).where(eq(projectT.teamId, id)),
      db.select({ n: count() }).from(cycleT).where(eq(cycleT.teamId, id)),
   ]);
   const total = Number(issues[0].n) + Number(projects[0].n) + Number(cycles[0].n);
   if (total > 0)
      throw new ApiError(409, `Team '${id}' tem issues/projects/cycles — esvazie antes de apagar`);

   await db.delete(teamMember).where(eq(teamMember.teamId, id));
   await db.delete(teamT).where(eq(teamT.id, id));
   return true;
}
