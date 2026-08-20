import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, teamMember } from '@/db/schema';
import { isAdmin } from './auth';

export type UserRow = typeof appUser.$inferSelect;

export interface MeDto {
   id: string;
   slug: string;
   name: string;
   email: string;
   avatarUrl: string | null;
   role: string;
   admin: boolean;
   teamIds: string[];
}

/** Usuário corrente (do e-mail SSO) + times + flag admin. */
export async function getMe(db: Db, email: string): Promise<MeDto> {
   const user = await getOrCreateUser(db, email);
   const teams = await db
      .select({ teamId: teamMember.teamId })
      .from(teamMember)
      .where(eq(teamMember.userId, user.id));
   return {
      id: user.id,
      slug: user.slug,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      admin: isAdmin(user.email),
      teamIds: teams.map((t) => t.teamId),
   };
}

function slugFromEmail(email: string): string {
   return email
      .split('@')[0]
      .replace(/[^a-z0-9._-]/gi, '')
      .toLowerCase()
      .slice(0, 60);
}

function nameFromEmail(email: string): string {
   const local = email.split('@')[0];
   return (
      local
         .split(/[._-]+/)
         .filter(Boolean)
         .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
         .join(' ') || local
   );
}

/**
 * Resolve o usuário pelo e-mail do SSO; provisiona no 1º acesso (role via allowlist).
 * Idempotente por e-mail (unique).
 */
export async function getOrCreateUser(db: Db, email: string): Promise<UserRow> {
   const normalized = email.trim().toLowerCase();
   const existing = await db.select().from(appUser).where(eq(appUser.email, normalized)).limit(1);
   if (existing.length > 0) return existing[0];

   let slug = slugFromEmail(normalized);
   // garante unicidade do slug
   const slugTaken = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.slug, slug))
      .limit(1);
   if (slugTaken.length > 0) slug = `${slug}-${randomUUID().slice(0, 6)}`;

   const now = new Date();
   const row = {
      id: randomUUID(),
      slug,
      name: nameFromEmail(normalized),
      email: normalized,
      avatarUrl: `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(slug)}`,
      role: isAdmin(normalized) ? 'Admin' : 'Member',
      presence: 'offline',
      timezone: null,
      joinedAt: now.toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now,
   };
   const inserted = await db.insert(appUser).values(row).onConflictDoNothing().returning();
   if (inserted.length > 0) return inserted[0];
   // corrida: outro request inseriu — relê
   const again = await db.select().from(appUser).where(eq(appUser.email, normalized)).limit(1);
   return again[0];
}
