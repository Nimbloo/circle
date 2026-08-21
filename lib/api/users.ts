import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { Db } from '@/db';
import { appUser, teamMember } from '@/db/schema';
import { isAdmin } from './auth';
import { ApiError } from './errors';

export type UserRow = typeof appUser.$inferSelect;

const BCRYPT_ROUNDS = 10;

/** URL do avatar gerado (dicebear) a partir do slug — default de quem não subiu foto. */
export function dicebearAvatarUrl(slug: string): string {
   return `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(slug)}`;
}

/** Token de convite forte (32 bytes → 64 chars hex, cabe no varchar(64)). */
function generateInviteToken(): string {
   return randomBytes(32).toString('hex');
}

/** Compara dois tokens em tempo constante, com guarda de tamanho (evita timing/length leak). */
function tokensMatch(stored: string, provided: string): boolean {
   const a = Buffer.from(stored, 'utf8');
   const b = Buffer.from(provided, 'utf8');
   if (a.length !== b.length) return false;
   return timingSafeEqual(a, b);
}

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

/** Usuário corrente (do e-mail da sessão) + times + flag admin. */
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
            avatarUrl: dicebearAvatarUrl(slug),
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

/** Resultado do convite. `alreadyRegistered` = usuário já tinha senha (conta ativa). */
export type InviteResult = UserRow & { alreadyRegistered: boolean };

/**
 * Convida um usuário pelo e-mail. Idempotente. Três casos:
 *  - Usuário novo → provisiona (sem senha) + gera `inviteToken` single-use.
 *  - Convite pendente (existe, SEM senha) → atualiza a role + renova o token.
 *  - JÁ CADASTRADO (existe, COM senha) → NÃO gera token novo nem reseta nada
 *    (o link de signup seria inútil — setPassword rejeitaria com 409). Só atualiza a
 *    role se o admin pediu uma diferente. Sinaliza `alreadyRegistered:true` p/ o
 *    chamador não disparar o e-mail de convite.
 * O `inviteToken` (quando gerado) volta na row — o chamador o entrega ao convidado.
 */
export async function inviteUser(db: Db, email: string, role: string): Promise<InviteResult> {
   const normalized = email.trim().toLowerCase();
   const existing = await db.select().from(appUser).where(eq(appUser.email, normalized)).limit(1);
   if (existing.length > 0) {
      const current = existing[0];
      if (current.passwordHash) {
         // Conta ativa: só reconcilia a role (se mudou), sem token nem reset.
         if (current.role !== role) {
            await db
               .update(appUser)
               .set({ role, updatedAt: new Date() })
               .where(eq(appUser.email, normalized));
         }
         return { ...current, role, inviteToken: null, alreadyRegistered: true };
      }
      // Convite ainda pendente: renova o token e atualiza a role.
      const inviteToken = generateInviteToken();
      await db
         .update(appUser)
         .set({ role, inviteToken, updatedAt: new Date() })
         .where(eq(appUser.email, normalized));
      return { ...current, role, inviteToken, alreadyRegistered: false };
   }
   const inviteToken = generateInviteToken();
   const created = await provisionUser(db, normalized, role);
   await db
      .update(appUser)
      .set({ inviteToken, updatedAt: new Date() })
      .where(eq(appUser.id, created.id));
   return { ...created, inviteToken, alreadyRegistered: false };
}

export interface UpdateProfileInput {
   name?: string;
   timezone?: string | null;
}

/**
 * Atualiza o perfil do usuário corrente (pelo e-mail da sessão). Campos opcionais:
 * `name` e `timezone`. Provisiona o usuário se ainda não existir. Retorna o MeDto.
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
   if (Object.keys(set).length > 0) {
      await db
         .update(appUser)
         .set({ ...set, updatedAt: new Date() })
         .where(eq(appUser.id, user.id));
   }
   return getMe(db, user.email);
}

/**
 * Define a senha (bcrypt) de um usuário JÁ convidado, validando o token single-use.
 * Regras (fecha o takeover de conta via /signup):
 *  - e-mail sem app_user      → 403 (não convidado).
 *  - passwordHash já setado    → 409 (já cadastrado; use o fluxo de reset).
 *  - inviteToken null ou token divergente (compare timing-safe) → 403.
 *    (Usuário SSO tem inviteToken null → nenhum token casa → 403.)
 *  - OK → grava o hash e LIMPA o inviteToken (single-use).
 */
export async function setPassword(
   db: Db,
   email: string,
   password: string,
   token: string
): Promise<void> {
   const normalized = email.trim().toLowerCase();
   const rows = await db
      .select({ id: appUser.id, hash: appUser.passwordHash, inviteToken: appUser.inviteToken })
      .from(appUser)
      .where(eq(appUser.email, normalized))
      .limit(1);
   if (rows.length === 0) throw new ApiError(403, 'E-mail não convidado');
   if (rows[0].hash) throw new ApiError(409, 'Senha já cadastrada');
   if (!rows[0].inviteToken || !tokensMatch(rows[0].inviteToken, token)) {
      throw new ApiError(403, 'Convite inválido ou expirado');
   }
   const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
   await db
      .update(appUser)
      .set({ passwordHash, inviteToken: null, updatedAt: new Date() })
      .where(eq(appUser.email, normalized));
}
