import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';
import { isPublicApiPath } from '@/lib/api/public-routes';

// Instância EDGE-SAFE (só a authConfig, sem Credentials/db) — evita puxar pg/bcrypt/
// node:crypto pro bundle Edge do middleware.
const { auth } = NextAuth(authConfig);

/**
 * Gate de sessão DEFAULT-DENY (só checa a presença do JWT no cookie — nenhum acesso
 * ao banco aqui, Edge-safe):
 *  - `/api/*`: sem sessão → **401 JSON** (não redirect), exceto a allowlist pública
 *    (`/api/auth/*` = fluxo NextAuth; `/api/healthz` e `/api/readyz` = probes do
 *    kubelet, que não têm sessão — redirecionar/401 mataria o pod).
 *  - páginas: sem sessão → redirect `/login` (exceto `/login` e `/signup`).
 *
 * Fecha por padrão: uma rota nova sob `/api/v1` já nasce protegida. É a PRIMEIRA de
 * duas camadas — os handlers repetem a checagem com `requireEmail` (garantido pelo
 * `test/route-auth-guard.test.ts`), porque um bypass do middleware do Next chegaria
 * direto no handler. A allowlist pública vive em `lib/api/public-routes.ts`, lida
 * também pelo teste-guarda, para as duas camadas nunca divergirem.
 */
// `/invite/<token>`: landing do magic link — quem chega ainda nao tem sessao (e o
// ponto). A pagina nao autoriza nada; quem autoriza e o `signIn` (ver auth.ts).
const PUBLIC_PAGE_PREFIXES = ['/login', '/signup', '/invite'];

function unauthorized(): Response {
   return new Response(JSON.stringify({ title: 'Unauthorized', status: 401 }), {
      status: 401,
      headers: { 'content-type': 'application/problem+json' },
   });
}

export default auth(async (req) => {
   const { pathname } = req.nextUrl;

   if (pathname.startsWith('/api')) {
      if (isPublicApiPath(pathname)) return;
      if (req.auth) return; // sessão de humano (cookie NextAuth)
      // Auth de MÁQUINA: Bearer JWT do Keycloak (service accounts). Valida no gate
      // (Edge-safe, Web Crypto) — senão rotas sem `requireEmail` ficariam expostas.
      const authz = req.headers.get('authorization');
      const m = authz?.match(/^Bearer\s+(.+)$/i);
      if (m) {
         const { verifyKeycloakJwt } = await import('@/lib/api/keycloak-jwt');
         if (await verifyKeycloakJwt(m[1].trim())) return;
      }
      return unauthorized();
   }

   const isPublicPage = PUBLIC_PAGE_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
   );
   if (isPublicPage) return;
   if (!req.auth) {
      return Response.redirect(new URL('/login', req.nextUrl.origin));
   }
});

export const config = {
   // Exclui assets estáticos e o favicon; tudo o mais passa pelo gate.
   matcher: [
      '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp)$).*)',
   ],
};
