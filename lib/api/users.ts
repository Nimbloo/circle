import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, teamMember } from '@/db/schema';
import { isAdmin } from './auth';
import { ApiError } from './errors';

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
      admin: await isAdmin(user.email, db),
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

   const base = slugFromEmail(normalized);
   let slug = base;
   // garante unicidade do slug (best-effort; a corrida real é tratada no loop de insert)
   const slugTaken = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.slug, slug))
      .limit(1);
   if (slugTaken.length > 0) slug = `${base}-${randomUUID().slice(0, 6)}`;

   // Bootstrap do 1º admin: allowlist/role-DB OU — se não há NENHUM admin ainda —
   // o primeiro usuário criado vira Admin (sistema sem admin destrava sozinho).
   // (2 primeiros logins simultâneos podem virar 2 admins — aceitável p/ tool interna.)
   let role = (await isAdmin(normalized, db)) ? 'Admin' : 'Member';
   if (role !== 'Admin') {
      const admins = await db.select({ c: count() }).from(appUser).where(eq(appUser.role, 'Admin'));
      if (Number(admins[0]?.c ?? 0) === 0) role = 'Admin';
   }

   const now = new Date();
   const baseRow = {
      name: nameFromEmail(normalized),
      email: normalized,
      role,
      presence: 'offline',
      timezone: null,
      joinedAt: now.toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now,
   };

   // Insere tratando a corrida em AMBAS as constraints unique (email E slug):
   // - conflito por EMAIL = outro request já criou este usuário → relê e devolve.
   // - conflito por SLUG (e-mail diferente, mesmo local-part) → novo slug sufixado + retenta.
   for (let attempt = 0; attempt < 4; attempt++) {
      const inserted = await db
         .insert(appUser)
         .values({
            ...baseRow,
            id: randomUUID(),
            slug,
            avatarUrl: `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(slug)}`,
         })
         .onConflictDoNothing()
         .returning();
      if (inserted.length > 0) return inserted[0];

      const byEmail = await db.select().from(appUser).where(eq(appUser.email, normalized)).limit(1);
      if (byEmail.length > 0) return byEmail[0]; // conflito era por e-mail → pronto.

      // conflito era por slug (e-mail distinto) → sufixa e tenta de novo.
      slug = `${base}-${randomUUID().slice(0, 6)}`;
   }
   throw new ApiError(500, 'Não foi possível provisionar o usuário (colisão de slug)');
}
