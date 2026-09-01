import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, teamMember, issueSubscription } from '@/db/schema';
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
   subscribedIssueIds: string[];
   /** Handle do GitHub — liga o PR (que guarda o login) a este usuário. */
   githubLogin: string | null;
}

/** Usuário corrente (do e-mail da sessão) + times + flag admin. */
export async function getMe(db: Db, email: string): Promise<MeDto> {
   const user = await getOrCreateUser(db, email);
   const teams = await db
      .select({ teamId: teamMember.teamId })
      .from(teamMember)
      .where(eq(teamMember.userId, user.id));
   const subscriptions = await db
      .select({ issueId: issueSubscription.issueId })
      .from(issueSubscription)
      .where(eq(issueSubscription.userId, user.id));
   return {
      id: user.id,
      slug: user.slug,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      admin: await isAdmin(user.email, db),
      teamIds: teams.map((t) => t.teamId),
      subscribedIssueIds: subscriptions.map((s) => s.issueId),
      githubLogin: user.githubLogin,
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
 * Insere um novo app_user com a role dada, tratando a corrida em AMBAS as constraints
 * unique (email E slug). Assume que o e-mail ainda não existe (chamador já checou).
 * - conflito por EMAIL = outro request já criou → relê e devolve.
 * - conflito por SLUG (e-mail diferente, mesmo local-part) → novo slug sufixado + retenta.
 */
async function provisionUser(db: Db, normalizedEmail: string, role: string): Promise<UserRow> {
   const base = slugFromEmail(normalizedEmail);
   let slug = base;
   const slugTaken = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.slug, slug))
      .limit(1);
   if (slugTaken.length > 0) slug = `${base}-${randomUUID().slice(0, 6)}`;

   const now = new Date();
   const baseRow = {
      name: nameFromEmail(normalizedEmail),
      email: normalizedEmail,
      role,
      presence: 'offline',
      timezone: null,
      joinedAt: now.toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now,
   };

   for (let attempt = 0; attempt < 4; attempt++) {
      const inserted = await db
         .insert(appUser)
         .values({
            ...baseRow,
            id: randomUUID(),
            slug,
            avatarUrl: null, // sem foto → UI mostra iniciais coloridas (AvatarFallback)
         })
         .onConflictDoNothing()
         .returning();
      if (inserted.length > 0) return inserted[0];

      const byEmail = await db
         .select()
         .from(appUser)
         .where(eq(appUser.email, normalizedEmail))
         .limit(1);
      if (byEmail.length > 0) return byEmail[0]; // conflito era por e-mail → pronto.

      slug = `${base}-${randomUUID().slice(0, 6)}`; // conflito por slug → sufixa e retenta.
   }
   throw new ApiError(500, 'Não foi possível provisionar o usuário (colisão de slug)');
}

/**
 * Resolve o usuário pelo e-mail da sessão; provisiona no 1º acesso (role via allowlist).
 * Idempotente por e-mail (unique).
 */
export async function getOrCreateUser(db: Db, email: string): Promise<UserRow> {
   const normalized = email.trim().toLowerCase();
   const existing = await db.select().from(appUser).where(eq(appUser.email, normalized)).limit(1);
   if (existing.length > 0) return existing[0];

   const role = (await isAdmin(normalized, db)) ? 'Admin' : 'Member';
   return provisionUser(db, normalized, role);
}

export interface UpdateProfileInput {
   name?: string;
   timezone?: string | null;
   githubLogin?: string | null;
}

/**
 * Atualiza o perfil do usuário corrente (pelo e-mail da sessão). Campos opcionais:
 * `name`, `timezone` e `githubLogin`. Provisiona o usuário se ainda não existir.
 */
export async function updateProfile(
   db: Db,
   email: string,
   patch: UpdateProfileInput
): Promise<MeDto> {
   const user = await getOrCreateUser(db, email);
   const set: Partial<UserRow> = {};
   if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new ApiError(400, 'Nome não pode ser vazio');
      set.name = name;
   }
   if (patch.timezone !== undefined) set.timezone = patch.timezone?.trim() || null;
   if (patch.githubLogin !== undefined) {
      // Aceita colado da URL do perfil (github.com/fulano) ou com @ na frente.
      const raw = patch.githubLogin
         ?.trim()
         .replace(/^@/, '')
         .replace(/^https?:\/\/github\.com\//i, '');
      set.githubLogin = raw ? raw.replace(/\/.*$/, '') : null;
   }
   if (Object.keys(set).length > 0) {
      await db
         .update(appUser)
         .set({ ...set, updatedAt: new Date() })
         .where(eq(appUser.id, user.id));
   }
   return getMe(db, user.email);
}
