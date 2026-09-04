import { randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, invite } from '@/db/schema';
import { ALLOWED_EMAIL_DOMAIN } from '@/auth.config';
import { ApiError } from './errors';
import type { UserRef } from './issues';

/** Validade do convite. Curta o bastante para um link vazado não ser permanente. */
const TTL_DAYS = 7;

/**
 * Papéis que um convite pode conceder (#100). `Admin` fica de fora de propósito —
 * promover a admin é um ato explícito na tela de membros, não um link por e-mail.
 */
export const INVITABLE_ROLES = ['Member', 'Guest'];

export interface InviteDto {
   id: string;
   email: string;
   /** Papel com que o convidado é provisionado no 1º login (#100): Member|Guest. */
   role: string;
   /** Só volta na CRIAÇÃO — é o segredo do magic link, não se relista depois. */
   token?: string;
   invitedBy: UserRef | null;
   createdAt: string;
   expiresAt: string;
   acceptedAt: string | null;
   expired: boolean;
}

/** Link que o admin copia/envia. `AUTH_URL` é a origem canônica do app. */
export function inviteUrl(token: string): string {
   const base = process.env.AUTH_URL || 'https://circle.nimbloo.ai';
   return `${base}/invite/${token}`;
}

function normalize(email: string): string {
   return email.trim().toLowerCase();
}

function toDto(
   row: typeof invite.$inferSelect,
   inviter: typeof appUser.$inferSelect | undefined,
   opts: { withToken?: boolean } = {}
): InviteDto {
   return {
      id: row.id,
      email: row.email,
      role: row.role,
      ...(opts.withToken ? { token: row.token } : {}),
      invitedBy: inviter
         ? {
              id: inviter.id,
              slug: inviter.slug,
              name: inviter.name,
              email: inviter.email,
              avatarUrl: inviter.avatarUrl,
           }
         : null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      expired: !row.acceptedAt && row.expiresAt.getTime() < Date.now(),
   };
}

/**
 * Cria (ou renova) o convite de um e-mail. Idempotente por e-mail: reconvidar gera token
 * novo e estende a validade, em vez de acumular linha.
 *
 * O domínio é travado aqui E no `signIn` — checar só na criação deixaria a porta aberta
 * caso alguém insira convite por outro caminho.
 */
export async function createInvite(
   db: Db,
   email: string,
   invitedByEmail: string,
   role: string = 'Member'
): Promise<InviteDto> {
   if (!INVITABLE_ROLES.includes(role)) {
      throw new ApiError(400, `Papel inválido no convite (use ${INVITABLE_ROLES.join('|')})`);
   }
   const normalized = normalize(email);
   if (!normalized.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      throw new ApiError(400, `Só é possível convidar e-mails ${ALLOWED_EMAIL_DOMAIN}`);
   }

   const existingUser = await db
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.email, normalized))
      .limit(1);
   if (existingUser.length) {
      throw new ApiError(409, `'${normalized}' já é usuário do Circle`);
   }

   const inviter = await db
      .select()
      .from(appUser)
      .where(eq(appUser.email, normalize(invitedByEmail)))
      .limit(1);

   const token = randomBytes(32).toString('hex');
   const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

   const [row] = await db
      .insert(invite)
      .values({
         id: randomUUID(),
         email: normalized,
         token,
         invitedById: inviter[0]?.id ?? null,
         role,
         expiresAt,
      })
      .onConflictDoUpdate({
         target: invite.email,
         // Reconvite: token e validade novos, e o convite volta a ficar pendente.
         set: { token, expiresAt, acceptedAt: null, invitedById: inviter[0]?.id ?? null, role },
      })
      .returning();

   return toDto(row, inviter[0], { withToken: true });
}

/** Convites do workspace, mais recentes primeiro. Sem token — ele só sai na criação. */
export async function listInvites(db: Db): Promise<InviteDto[]> {
   const rows = await db.select().from(invite).orderBy(desc(invite.createdAt));
   if (rows.length === 0) return [];
   const inviters = await db.select().from(appUser);
   const byId = new Map(inviters.map((u) => [u.id, u]));
   return rows.map((r) => toDto(r, r.invitedById ? byId.get(r.invitedById) : undefined));
}

export async function revokeInvite(db: Db, id: string): Promise<boolean> {
   const res = await db.delete(invite).where(eq(invite.id, id)).returning({ id: invite.id });
   return res.length > 0;
}

/** Convite pelo token do magic link, só se ainda valer (para a tela do convite). */
export async function getInviteByToken(db: Db, token: string): Promise<InviteDto | null> {
   const rows = await db
      .select()
      .from(invite)
      .where(
         and(eq(invite.token, token), isNull(invite.acceptedAt), gt(invite.expiresAt, new Date()))
      )
      .limit(1);
   return rows.length ? toDto(rows[0], undefined) : null;
}

/**
 * Gate do login: consome o convite pendente e válido do e-mail, se houver.
 *
 * Retorna o papel do convite só quando havia um utilizável (`null` caso contrário) — e o marca como aceito no mesmo
 * passo (single-use). É chamado pelo `signIn` DEPOIS de o Keycloak confirmar domínio e
 * e-mail verificado, então o convite dispensa apenas a associação ao grupo `app-circle`,
 * nunca a autenticação.
 */
export async function consumeInvite(db: Db, email: string): Promise<{ role: string } | null> {
   const normalized = normalize(email);
   const accepted = await db
      .update(invite)
      .set({ acceptedAt: new Date() })
      .where(
         and(
            eq(invite.email, normalized),
            isNull(invite.acceptedAt),
            gt(invite.expiresAt, new Date())
         )
      )
      .returning({ id: invite.id, role: invite.role });
   return accepted.length > 0 ? { role: accepted[0].role } : null;
}
