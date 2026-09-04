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
import { authConfig, hasNimblooIdentity } from './auth.config';

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

         // PISO — identidade Nimbloo verificada (domínio + email_verified). Nem convite
         // dispensa isto: o convite libera a AUTORIZAÇÃO, nunca a autenticação.
         if (!hasNimblooIdentity(profile)) return false;
         const email = normalizeEmail((profile as { email?: unknown } | null | undefined)?.email);
         if (!email) return false;

         const { getDb } = await import('@/db');
         const db = getDb();

         // A regra vive em `lib/api/login-gate.ts` (grupo OU convite), testada direto em
         // `test/login-gate.test.ts` — aqui dentro do callback ela só seria exercitável
         // através do NextAuth. Uma cópia da regra aqui divergiria em silêncio.
         const { decideKeycloakLogin } = await import('@/lib/api/login-gate');
         const decision = await decideKeycloakLogin(db, profile, email);
         // Conta desativada (#100): redireciona pro login com a mensagem explícita —
         // `false` daria só o "AccessDenied" genérico do NextAuth.
         if (!decision.allowed) {
            return decision.reason === 'deactivated' ? '/login?error=deactivated' : false;
         }

         const { getOrCreateUser } = await import('@/lib/api/users');
         // Convite com papel Guest (#100) provisiona o usuário já como convidado.
         const user = await getOrCreateUser(
            db,
            email,
            decision.via === 'invite' ? decision.role : 'Member'
         );

         if (decision.via === 'invite') {
            // Entrada por convite é evento de segurança: fica no audit log.
            const { recordAudit } = await import('@/lib/api/audit');
            await recordAudit(db, {
               actorId: user.id,
               action: 'invite.accept',
               targetType: 'user',
               targetId: user.id,
               meta: { email },
            });
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
