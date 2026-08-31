/**
 * Allowlist ÚNICA de rotas de API públicas (sem sessão).
 *
 * Fonte da verdade compartilhada pelo gate de borda (`middleware.ts`) e pelo
 * teste-guarda (`test/route-auth-guard.test.ts`), que exige `requireEmail` em
 * todo handler fora desta lista. Manter os dois lendo daqui evita a deriva em
 * que uma rota vira pública num lugar e não no outro.
 *
 * Edge-safe: só constantes, sem dependência de Node.
 */

/**
 * Paths EXATOS (não prefixo): probes do kubelet + endpoints autenticados por
 * HMAC (Sentry `Sentry-Hook-Signature`, GitHub `X-Hub-Signature-256`), que não
 * têm sessão. Exato de propósito — assim uma rota NOVA sob `.../sentry/` não
 * nasce pública por acidente; quem adicionar precisa liberar aqui.
 */
export const PUBLIC_API_EXACT: ReadonlySet<string> = new Set([
   '/api/healthz',
   '/api/readyz',
   '/api/metrics',
   '/api/v1/integrations/sentry/issues/create',
   '/api/v1/integrations/sentry/issues/link',
   '/api/v1/integrations/sentry/webhook',
   '/api/v1/integrations/sentry/teams/options',
   '/api/v1/integrations/github/webhook',
]);

/** Só o NextAuth precisa do subtree inteiro (`/api/auth/*`). */
export const PUBLIC_API_PREFIXES: readonly string[] = ['/api/auth'];

/** True se o path dispensa sessão. */
export function isPublicApiPath(pathname: string): boolean {
   return (
      PUBLIC_API_EXACT.has(pathname) ||
      PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
   );
}
