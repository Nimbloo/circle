/**
 * Identidade do usuário autenticado.
 *
 * Produção: sessão assinada do NextAuth (JWT no cookie) — lida via `auth()`.
 * Testes (NODE_ENV==='test'): lê o header `x-forwarded-email` do request, mantendo
 * os testes de rota existentes funcionando sem stack de sessão. É o SEAM DE TESTE.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser } from '@/db/schema';

const TEST_EMAIL_HEADER = 'x-forwarded-email';

/** Em teste, deriva o e-mail do header injetado pelos helpers de teste. */
function emailFromTestHeader(req?: Request): string | null {
   const raw = req?.headers.get(TEST_EMAIL_HEADER);
   return raw ? raw.trim().toLowerCase() : null;
}

/** Extrai o token de um header `Authorization: Bearer <jwt>`, ou null. */
function bearerToken(req?: Request): string | null {
   const h = req?.headers.get('authorization') ?? req?.headers.get('Authorization');
   if (!h) return null;
   const m = h.match(/^Bearer\s+(.+)$/i);
   return m ? m[1].trim() : null;
}

/** Quem está chamando. `machineRole` só vem preenchido na auth de máquina (Bearer). */
export interface RequestIdentity {
   email: string;
   /** Papel vindo do token do Keycloak — o `app_user` é sincronizado com ele. */
   machineRole: string | null;
}

/**
 * Identidade do chamador (e-mail minúsculo) ou null.
 * Async: em produção consulta a sessão do NextAuth.
 */
export async function identityFromRequest(req?: Request): Promise<RequestIdentity | null> {
   // Guard DUPLO: só ativa o seam de header em teste (vitest) E fora do runtime do
   // Next. O server de produção (`next start`) sempre define NEXT_RUNTIME → o bypass
   // do header NUNCA liga em prod, mesmo que NODE_ENV venha errado por acidente.
   if (process.env.NODE_ENV === 'test' && !process.env.NEXT_RUNTIME) {
      const testEmail = emailFromTestHeader(req);
      return testEmail ? { email: testEmail, machineRole: null } : null;
   }
   // Auth de MÁQUINA: Bearer JWT emitido pelo Keycloak (service accounts). Valida
   // contra o JWKS do realm — coerente com o SSO único, sem cofre de tokens no app.
   const bearer = bearerToken(req);
   if (bearer) {
      const { verifyKeycloakJwt, identityFromPayload } = await import('./keycloak-jwt');
      const payload = await verifyKeycloakJwt(bearer);
      if (!payload) return null;
      // Papel PELO KEYCLOAK também para máquina: sem client role de `circle` (nem o
      // grupo `app-circle`) o token não vale aqui. Mesma regra do login humano — então
      // revogar a role no IdP desliga a máquina no próximo token, e o papel dela é o do
      // token, em vez de ficar preso ao `Member` do provisionamento.
      const { roleFromProfile } = await import('@/auth.config');
      const machineRole = roleFromProfile(payload);
      if (!machineRole) return null;
      const identity = identityFromPayload(payload);
      return identity ? { email: identity, machineRole } : null;
   }
   // Import dinâmico: mantém o next-auth fora do grafo estático (edge + testes).
   const { auth } = await import('@/auth');
   const session = await auth();
   const email = session?.user?.email;
   return email ? { email: email.trim().toLowerCase(), machineRole: null } : null;
}

/** Conveniência: só o e-mail do chamador (a maioria das rotas não precisa do resto). */
export async function emailFromRequest(req?: Request): Promise<string | null> {
   return (await identityFromRequest(req))?.email ?? null;
}

/**
 * Admin = e-mail na allowlist (CIRCLE_ADMIN_EMAILS) OU usuário com role='Admin' no
 * banco (coluna autoritativa). Async por precisar consultar o banco.
 */
/**
 * Break-glass: allowlist `CIRCLE_ADMIN_EMAILS`. NÃO consulta o banco de propósito — é o
 * que permite ao login REBAIXAR alguém quando o Keycloak revoga a role. Usar `isAdmin`
 * aqui seria circular: quem já é Admin no banco continuaria Admin para sempre.
 */
export function isBreakGlassAdmin(email: string): boolean {
   const normalized = email.trim().toLowerCase();
   return (process.env.CIRCLE_ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .includes(normalized);
}

export async function isAdmin(email: string, db: Db): Promise<boolean> {
   const normalized = email.trim().toLowerCase();
   if (isBreakGlassAdmin(normalized)) return true;
   const rows = await db
      .select({ role: appUser.role })
      .from(appUser)
      .where(eq(appUser.email, normalized))
      .limit(1);
   return rows.length > 0 && rows[0].role === 'Admin';
}
