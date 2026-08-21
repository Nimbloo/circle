/**
 * Identidade via header injetado pelo oauth2-proxy (Google SSO @nimbloo.ai).
 * A app não valida token — confia no header (rede fechada; oauth2-proxy à frente).
 * Em dev, sem proxy, usa CIRCLE_AUTH_DEV_FALLBACK_EMAIL.
 */
import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser } from '@/db/schema';

const EMAIL_HEADER = process.env.CIRCLE_AUTH_EMAIL_HEADER ?? 'x-forwarded-email';
const DEV_FALLBACK = process.env.CIRCLE_AUTH_DEV_FALLBACK_EMAIL ?? '';

/** Compara duas strings em tempo constante (sem vazar tamanho como early-return útil). */
function secretsMatch(a: string, b: string): boolean {
   const ab = Buffer.from(a, 'utf8');
   const bb = Buffer.from(b, 'utf8');
   if (ab.length !== bb.length) return false;
   return timingSafeEqual(ab, bb);
}

/**
 * Autenticidade da borda: quando CIRCLE_PROXY_SHARED_SECRET está setado, exige
 * `Authorization: Basic base64(<user>:<segredo>)` (mandado pelo oauth2-proxy via
 * --set-basic-auth) cujo password bata com o segredo. Sem o env, enforcement OFF
 * (retrocompatível). Valida só AUTENTICIDADE; a IDENTIDADE segue no X-Forwarded-Email.
 */
function proxyAuthentic(req: Request): boolean {
   const expected = process.env.CIRCLE_PROXY_SHARED_SECRET;
   if (!expected) return true; // enforcement OFF
   const header = req.headers.get('authorization');
   if (!header) return false;
   const [scheme, encoded] = header.split(' ');
   if (!encoded || scheme.toLowerCase() !== 'basic') return false;
   let decoded: string;
   try {
      decoded = Buffer.from(encoded, 'base64').toString('utf8');
   } catch {
      return false;
   }
   const sep = decoded.indexOf(':');
   if (sep < 0) return false;
   const password = decoded.slice(sep + 1);
   return secretsMatch(password, expected);
}

export function emailFromRequest(req: Request): string | null {
   if (!proxyAuthentic(req)) return null;
   const raw = req.headers.get(EMAIL_HEADER) ?? (DEV_FALLBACK || null);
   return raw ? raw.trim().toLowerCase() : null;
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
