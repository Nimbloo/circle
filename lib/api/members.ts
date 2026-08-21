import { eq, count } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, teamMember } from '@/db/schema';
import { ApiError } from './errors';
import { publish } from './events';

type UserRow = typeof appUser.$inferSelect;

export interface MemberDto {
   id: string;
   slug: string;
   name: string;
   email: string;
   avatarUrl: string | null;
   role: string;
   presence: string;
   timezone: string | null;
   joinedAt: string;
   teamCount: number;
}

export type MemberSort = 'name' | 'joined' | 'teams';

function toDto(u: UserRow, teamCount: number): MemberDto {
   return {
      id: u.id,
      slug: u.slug,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      role: u.role,
      presence: u.presence,
      timezone: u.timezone,
      joinedAt: u.joinedAt,
      teamCount,
   };
}

async function teamCounts(db: Db): Promise<Map<string, number>> {
   const rows = await db
      .select({ userId: teamMember.userId, n: count() })
      .from(teamMember)
      .groupBy(teamMember.userId);
   return new Map(rows.map((r) => [r.userId, Number(r.n)]));
}

export interface ListMembersOptions {
   role?: string[];
   sort?: MemberSort;
   dir?: 'asc' | 'desc';
}

export async function listMembers(db: Db, opts: ListMembersOptions = {}): Promise<MemberDto[]> {
   const [users, counts] = await Promise.all([db.select().from(appUser), teamCounts(db)]);
   let dtos = users.map((u) => toDto(u, counts.get(u.id) ?? 0));

   if (opts.role?.length) {
      const set = new Set(opts.role);
      dtos = dtos.filter((d) => set.has(d.role));
   }

   const dir = opts.dir === 'desc' ? -1 : 1;
   const by = opts.sort ?? 'name';
   dtos.sort((a, b) => {
      const cmp =
         by === 'teams'
            ? a.teamCount - b.teamCount
            : by === 'joined'
              ? a.joinedAt.localeCompare(b.joinedAt)
              : a.name.localeCompare(b.name);
      return cmp * dir;
   });
   return dtos;
}

export async function getMember(db: Db, id: string): Promise<MemberDto | null> {
   const rows = await db.select().from(appUser).where(eq(appUser.id, id)).limit(1);
   if (rows.length === 0) return null;
   const counts = await teamCounts(db);
   return toDto(rows[0], counts.get(id) ?? 0);
}

export const MEMBER_ROLES = ['Member', 'Admin', 'Guest', 'Application'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Atualiza a role do membro (valida o enum). Retorna o MemberDto ou null se não existir. */
export async function updateMemberRole(
   db: Db,
   id: string,
   role: string
): Promise<MemberDto | null> {
   if (!MEMBER_ROLES.includes(role as MemberRole))
      throw new ApiError(400, `Role inválida: '${role}' (use ${MEMBER_ROLES.join('|')})`);
   const existing = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, id))
      .limit(1);
   if (existing.length === 0) return null;
   await db.update(appUser).set({ role, updatedAt: new Date() }).where(eq(appUser.id, id));
   publish({ entity: 'member', action: 'updated', id });
   return getMember(db, id);
}
