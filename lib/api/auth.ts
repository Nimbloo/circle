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

/**
 * E-mail do usuário autenticado (minúsculo) ou null.
 * Async: em produção consulta a sessão do NextAuth.
 */
export async function emailFromRequest(req?: Request): Promise<string | null> {
   // Guard DUPLO: só ativa o seam de header em teste (vitest) E fora do runtime do
   // Next. O server de produção (`next start`) sempre define NEXT_RUNTIME → o bypass
   // do header NUNCA liga em prod, mesmo que NODE_ENV venha errado por acidente.
   if (process.env.NODE_ENV === 'test' && !process.env.NEXT_RUNTIME) {
      return emailFromTestHeader(req);
   }
   // Import dinâmico: mantém o next-auth fora do grafo estático (edge + testes).
   const { auth } = await import('@/auth');
   const session = await auth();
   const email = session?.user?.email;
   return email ? email.trim().toLowerCase() : null;
}

/**
 * Admin = e-mail na allowlist (CIRCLE_ADMIN_EMAILS) OU usuário com role='Admin' no
 * banco (coluna autoritativa). Async por precisar consultar o banco.
 */
export async function isAdmin(email: string, db: Db): Promise<boolean> {
   const normalized = email.trim().toLowerCase();
   const admins = (process.env.CIRCLE_ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
   if (admins.includes(normalized)) return true;
   const rows = await db
      .select({ role: appUser.role })
      .from(appUser)
      .where(eq(appUser.email, normalized))
      .limit(1);
   return rows.length > 0 && rows[0].role === 'Admin';
}
