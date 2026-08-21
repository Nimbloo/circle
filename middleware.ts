import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

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
 * Fecha por padrão: uma rota nova sob `/api/v1` já nasce protegida, sem depender de
 * o handler lembrar do `requireEmail` (defesa em profundidade).
 */
const PUBLIC_PAGE_PREFIXES = ['/login', '/signup'];
const PUBLIC_API_EXACT = new Set(['/api/healthz', '/api/readyz']);
const PUBLIC_API_PREFIXES = ['/api/auth'];

function unauthorized(): Response {
   return new Response(JSON.stringify({ title: 'Unauthorized', status: 401 }), {
      status: 401,
      headers: { 'content-type': 'application/problem+json' },
   });
}

export default auth((req) => {
   const { pathname } = req.nextUrl;

   if (pathname.startsWith('/api')) {
      const isPublicApi =
         PUBLIC_API_EXACT.has(pathname) ||
         PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
      if (isPublicApi) return;
      if (!req.auth) return unauthorized();
      return;
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
