/**
 * Identidade via header injetado pelo oauth2-proxy (Google SSO @nimbloo.ai).
 * A app não valida token — confia no header (rede fechada; oauth2-proxy à frente).
 * Em dev, sem proxy, usa CIRCLE_AUTH_DEV_FALLBACK_EMAIL.
 */
const EMAIL_HEADER = process.env.CIRCLE_AUTH_EMAIL_HEADER ?? 'x-forwarded-email';
const DEV_FALLBACK = process.env.CIRCLE_AUTH_DEV_FALLBACK_EMAIL ?? '';

export function emailFromRequest(req: Request): string | null {
   const raw = req.headers.get(EMAIL_HEADER) ?? (DEV_FALLBACK || null);
   return raw ? raw.trim().toLowerCase() : null;
}

export function isAdmin(email: string): boolean {
   const admins = (process.env.CIRCLE_ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
   return admins.includes(email.toLowerCase());
}
