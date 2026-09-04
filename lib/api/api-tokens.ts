/**
 * Tokens da API pública (#101).
 *
 * O token em claro (`circle_<hex>`) existe UMA vez — na resposta da criação. O banco
 * guarda só o SHA-256 (`token_hash`, único) e o `prefix` visível, de modo que um dump
 * do banco não permite chamar a API. Revogar é `revoked_at`, não DELETE: o histórico de
 * uso (`last_used_at`) continua auditável.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { apiToken, appUser } from '@/db/schema';
import { ApiError } from './errors';
import { getOrCreateUser } from './users';

/** Escopos suportados. `write` NÃO implica `read` — a UI marca os dois quando quer ambos. */
export type ApiScope = 'read' | 'write';
export const API_SCOPES: readonly ApiScope[] = ['read', 'write'];

const TOKEN_PREFIX = 'circle_';
/** Nº de caracteres do token guardados em claro para o usuário reconhecê-lo na lista. */
const PREFIX_LENGTH = TOKEN_PREFIX.length + 6;

export interface ApiTokenDto {
   id: string;
   name: string;
   prefix: string;
   scopes: ApiScope[];
   createdAt: string;
   lastUsedAt: string | null;
   revokedAt: string | null;
   createdByName: string | null;
}

/** O DTO + o token em claro. Só a criação devolve isto; depois, nunca mais. */
export interface CreatedApiTokenDto extends ApiTokenDto {
   token: string;
}

type TokenRow = typeof apiToken.$inferSelect;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toDto(r: TokenRow, createdByName: string | null): ApiTokenDto {
   return {
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      scopes: (r.scopes ?? []) as ApiScope[],
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: iso(r.lastUsedAt),
      revokedAt: iso(r.revokedAt),
      createdByName,
   };
}

/** SHA-256 hex do token — a forma como ele é guardado e procurado. */
export function hashToken(raw: string): string {
   return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** `circle_` + 32 bytes aleatórios em hex (256 bits de entropia). */
function generateToken(): string {
   return `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
}

export async function listApiTokens(db: Db): Promise<ApiTokenDto[]> {
   const rows = await db
      .select({ token: apiToken, creatorName: appUser.name })
      .from(apiToken)
      .leftJoin(appUser, eq(apiToken.createdBy, appUser.id))
      .orderBy(desc(apiToken.createdAt));
   return rows.map((r) => toDto(r.token, r.creatorName));
}

export interface CreateApiTokenInput {
   name: string;
   scopes: ApiScope[];
}

/** Cria o token e devolve o valor em claro — a ÚNICA vez em que ele é exposto. */
export async function createApiToken(
   db: Db,
   input: CreateApiTokenInput,
   actorEmail: string
): Promise<CreatedApiTokenDto> {
   const name = input.name.trim();
   if (!name) throw new ApiError(400, 'name é obrigatório');
   const scopes = [...new Set(input.scopes)].filter((s): s is ApiScope =>
      API_SCOPES.includes(s as ApiScope)
   );
   if (scopes.length === 0) throw new ApiError(400, 'Informe ao menos um escopo (read/write)');

   const actor = await getOrCreateUser(db, actorEmail);
   const raw = generateToken();
   const id = randomUUID();
   const now = new Date();
   await db.insert(apiToken).values({
      id,
      name,
      tokenHash: hashToken(raw),
      prefix: raw.slice(0, PREFIX_LENGTH),
      scopes,
      createdBy: actor.id,
      createdAt: now,
   });
   const [row] = await db.select().from(apiToken).where(eq(apiToken.id, id)).limit(1);
   return { ...toDto(row, actor.name), token: raw };
}

/** Revoga (não apaga). Retorna false se o token não existe. */
export async function revokeApiToken(db: Db, id: string): Promise<boolean> {
   const res = await db
      .update(apiToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiToken.id, id), isNull(apiToken.revokedAt))!)
      .returning({ id: apiToken.id });
   if (res.length > 0) return true;
   const existing = await db.select().from(apiToken).where(eq(apiToken.id, id)).limit(1);
   return existing.length > 0; // já revogado — idempotente
}

export interface AuthenticatedToken {
   tokenId: string;
   scopes: ApiScope[];
   /** Usuário dono do token: a chamada pública age como ele (papel, escopo de Guest). */
   user: { id: string; role: string; email: string };
}

/**
 * Resolve o token em claro. Devolve null quando o formato não bate, o hash não existe
 * ou o token foi revogado. Marca `last_used_at` (best-effort — não bloqueia a request).
 */
export async function authenticateApiToken(
   db: Db,
   raw: string
): Promise<AuthenticatedToken | null> {
   const value = raw.trim();
   if (!value.startsWith(TOKEN_PREFIX)) return null;
   const hash = hashToken(value);
   const rows = await db
      .select({ token: apiToken, user: appUser })
      .from(apiToken)
      .leftJoin(appUser, eq(apiToken.createdBy, appUser.id))
      .where(eq(apiToken.tokenHash, hash))
      .limit(1);
   if (rows.length === 0) return null;
   const { token, user } = rows[0];
   // Comparação em tempo constante do hash recuperado (o lookup já é por igualdade,
   // mas isto fecha a diferença de tempo entre "hash existe" e "hash confere").
   const a = Buffer.from(hash, 'hex');
   const b = Buffer.from(token.tokenHash, 'hex');
   if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
   if (token.revokedAt) return null;
   if (!user) return null;
   if (user.deactivatedAt) return null;

   await db
      .update(apiToken)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiToken.id, token.id))
      .catch(() => {});

   return {
      tokenId: token.id,
      scopes: (token.scopes ?? []) as ApiScope[],
      user: { id: user.id, role: user.role, email: user.email },
   };
}
