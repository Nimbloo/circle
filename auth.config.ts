import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Keycloak from 'next-auth/providers/keycloak';

/**
 * Keycloak (OIDC) — SSO opcional, ligado SÓ quando as três vars estão presentes.
 * É fetch-based (edge-safe, como o Google), então vive aqui no config edge. Adicionar
 * o Keycloak = setar AUTH_KEYCLOAK_ISSUER/ID/SECRET; o provider e o botão de login
 * aparecem sozinhos (o botão via getProviders). O provisionamento do app_user por
 * e-mail no 1º login está no callback signIn de `auth.ts`.
 */
const keycloakEnabled =
   !!process.env.AUTH_KEYCLOAK_ISSUER &&
   !!process.env.AUTH_KEYCLOAK_ID &&
   !!process.env.AUTH_KEYCLOAK_SECRET;

/**
 * Config EDGE-SAFE do NextAuth — usada pelo `middleware.ts` (runtime Edge). Contém
 * SÓ o que o middleware precisa pra ler/validar a sessão JWT: strategy, secret, pages
 * e o provider Google (fetch-based, edge-ok). O provider Credentials (bcrypt) e os
 * callbacks que tocam o banco (pg) vivem em `auth.ts` — assim o bundle Edge não puxa
 * `pg`/`bcryptjs`/`node:crypto`.
 *
 * `allowDangerousEmailAccountLinking` foi REMOVIDO de propósito: sem adapter de banco
 * (sessão JWT) ele é no-op hoje, e deixá-lo armado vira vetor de takeover se um dia
 * um adapter for adicionado. O "linking" real é o app resolver o mesmo app_user por
 * e-mail (Google Workspace é autoritativo sobre @nimbloo.ai).
 */
export const ALLOWED_GOOGLE_DOMAIN = '@nimbloo.ai';

export const authConfig: NextAuthConfig = {
   session: { strategy: 'jwt' },
   trustHost: true,
   pages: { signIn: '/login' },
   secret: process.env.AUTH_SECRET,
   providers: [
      Google({
         clientId: process.env.AUTH_GOOGLE_ID,
         clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }),
      ...(keycloakEnabled
         ? [
              Keycloak({
                 clientId: process.env.AUTH_KEYCLOAK_ID,
                 clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
                 issuer: process.env.AUTH_KEYCLOAK_ISSUER,
              }),
           ]
         : []),
   ],
};
