/**
 * Config COMPLETA do NextAuth v5 — usada pelos route handlers (`/api/auth/[...nextauth]`)
 * e pelo `auth()` do app (via `lib/api/auth.ts`). Estende a `authConfig` edge-safe
 * (ver `auth.config.ts`) adicionando o callback `signIn` que toca o banco (JIT do
 * app_user). Isso puxa `pg`/`node:crypto` — por isso vive AQUI e não no `auth.config.ts`
 * que o middleware (Edge) importa.
 *
 * O acesso a db/users é sempre via `import()` dinâmico dentro do callback (que roda
 * no runtime Node dos route handlers).
 */
import NextAuth from 'next-auth';
import { authConfig, isAllowedKeycloakProfile } from './auth.config';

function normalizeEmail(email: unknown): string | null {
   if (typeof email !== 'string') return null;
   const e = email.trim().toLowerCase();
   return e.length > 0 ? e : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
   ...authConfig,
   callbacks: {
      async signIn({ account, profile }) {
         if (account?.provider !== 'keycloak') return true;
         // Gate único: domínio + e-mail verificado + grupo `app-circle` (ver
         // `isAllowedKeycloakProfile` em auth.config.ts para o porquê e a dependência
         // do claim `groups` no ID token).
         if (!isAllowedKeycloakProfile(profile)) return false;
         const email = normalizeEmail((profile as { email?: unknown } | null | undefined)?.email);
         if (!email) return false;
         const { getDb } = await import('@/db');
         const { getOrCreateUser } = await import('@/lib/api/users');
         await getOrCreateUser(getDb(), email);
         return true;
      },
      async jwt({ token, user }) {
         if (user?.email) token.email = user.email.toLowerCase();
         return token;
      },
      async session({ session, token }) {
         if (session.user && typeof token.email === 'string') {
            session.user.email = token.email;
         }
         return session;
      },
   },
});
