/**
 * Config COMPLETA do NextAuth v5 — usada pelos route handlers (`/api/auth/[...nextauth]`)
 * e pelo `auth()` do app (via `lib/api/auth.ts`). Estende a `authConfig` edge-safe
 * (ver `auth.config.ts`) adicionando o provider Credentials (bcrypt) e os callbacks
 * que tocam o banco. Estes puxam `pg`/`bcryptjs`/`node:crypto` — por isso vivem AQUI
 * e não no `auth.config.ts` que o middleware (Edge) importa.
 *
 * O acesso a db/bcrypt/users é sempre via `import()` dinâmico dentro de
 * `authorize`/callbacks (que rodam no runtime Node dos route handlers).
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig, ALLOWED_GOOGLE_DOMAIN } from './auth.config';

function normalizeEmail(email: unknown): string | null {
   if (typeof email !== 'string') return null;
   const e = email.trim().toLowerCase();
   return e.length > 0 ? e : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
   ...authConfig,
   providers: [
      ...authConfig.providers,
      Credentials({
         name: 'Credentials',
         credentials: {
            email: { label: 'Email', type: 'email' },
            password: { label: 'Password', type: 'password' },
         },
         async authorize(credentials) {
            const email = normalizeEmail(credentials?.email);
            const password = typeof credentials?.password === 'string' ? credentials.password : '';
            if (!email || !password) return null;

            const [{ getDb }, { appUser }, { eq }, bcryptMod] = await Promise.all([
               import('@/db'),
               import('@/db/schema'),
               import('drizzle-orm'),
               import('bcryptjs'),
            ]);
            const bcrypt = bcryptMod.default;
            const db = getDb();
            const rows = await db
               .select({
                  id: appUser.id,
                  email: appUser.email,
                  name: appUser.name,
                  hash: appUser.passwordHash,
               })
               .from(appUser)
               .where(eq(appUser.email, email))
               .limit(1);
            const row = rows[0];
            // Compara SEMPRE contra um hash (dummy quando não há linha/senha) para
            // equalizar o timing e não virar oráculo de "quem tem senha" (enumeração).
            const DUMMY = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8b2q9y0Z5f9m1oL7bqf1a2b3c4d5e6';
            const okPassword = await bcrypt.compare(password, row?.hash ?? DUMMY);
            if (!row || !row.hash || !okPassword) return null;
            return { id: row.id, email: row.email, name: row.name };
         },
      }),
   ],
   callbacks: {
      async signIn({ user, account, profile }) {
         if (account?.provider === 'google') {
            const email = normalizeEmail(user?.email);
            // Só @nimbloo.ai E com e-mail verificado pelo Google (defesa em profundidade).
            if (!email || !email.endsWith(ALLOWED_GOOGLE_DOMAIN)) return false;
            if (profile && profile.email_verified === false) return false;
            const { getDb } = await import('@/db');
            const { getOrCreateUser } = await import('@/lib/api/users');
            await getOrCreateUser(getDb(), email);
            return true;
         }
         if (account?.provider === 'keycloak') {
            // Keycloak é o IdP autoritativo: quem ele autentica pode entrar. Exige e-mail
            // presente e (quando o IdP informa) verificado; provisiona o app_user por e-mail.
            // Restrição opcional de domínio via AUTH_KEYCLOAK_ALLOWED_DOMAIN (ex.: "@nimbloo.ai").
            const email = normalizeEmail(user?.email);
            if (!email) return false;
            if (profile && profile.email_verified === false) return false;
            const allowedDomain = process.env.AUTH_KEYCLOAK_ALLOWED_DOMAIN?.trim().toLowerCase();
            if (allowedDomain && !email.endsWith(allowedDomain)) return false;
            const { getDb } = await import('@/db');
            const { getOrCreateUser } = await import('@/lib/api/users');
            await getOrCreateUser(getDb(), email);
            return true;
         }
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
