import type { NextAuthConfig } from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';

/**
 * Config EDGE-SAFE do NextAuth — usada pelo `middleware.ts` (runtime Edge). Contém
 * SÓ o que o middleware precisa pra ler/validar a sessão JWT: strategy, secret, pages
 * e o provider Keycloak (fetch/OIDC-discovery based, edge-ok — sem `pg`/`bcrypt`). Os
 * callbacks que tocam o banco vivem em `auth.ts` — assim o bundle Edge não puxa
 * `pg`/`node:crypto`.
 *
 * `allowDangerousEmailAccountLinking` foi REMOVIDO de propósito: sem adapter de banco
 * (sessão JWT) ele é no-op hoje, e deixá-lo armado vira vetor de takeover se um dia
 * um adapter for adicionado. O "linking" real é o app resolver o mesmo app_user por
 * e-mail (Keycloak é autoritativo sobre @nimbloo.ai).
 */
export const ALLOWED_EMAIL_DOMAIN = '@nimbloo.ai';

/** Grupo Keycloak que dá acesso ao Circle (concedido via Orbis → app-access). */
export const REQUIRED_GROUP = 'app-circle';

function normalizeEmail(email: unknown): string | null {
   if (typeof email !== 'string') return null;
   const e = email.trim().toLowerCase();
   return e.length > 0 ? e : null;
}

/** Aceita tanto "app-circle" quanto "/app-circle" (full group path). */
function normalizeGroup(g: unknown): string | null {
   if (typeof g !== 'string') return null;
   const trimmed = g.startsWith('/') ? g.slice(1) : g;
   return trimmed.length > 0 ? trimmed : null;
}

/**
 * Gate de acesso do login Keycloak: e-mail verificado + domínio @nimbloo.ai + pertencer
 * ao grupo REQUIRED_GROUP.
 *
 * IMPORTANTE: isto DEPENDE do client `circle` no Keycloak (realm `nimbloo-internal`)
 * emitir o claim `groups` no ID token — mapper "group membership" com "Add to ID token"
 * ON e "Full group path" OFF. Sem esse claim, `groups` chega ausente/vazio e o gate
 * fecha (ninguém consegue logar). É fail-closed intencional, mas precisa ser validado
 * na config do realm (feito separadamente no nimbloo-k8s).
 */
export function isAllowedKeycloakProfile(profile: unknown): boolean {
   if (!profile || typeof profile !== 'object') return false;
   const p = profile as Record<string, unknown>;
   const email = normalizeEmail(p.email);
   if (!email || !email.endsWith(ALLOWED_EMAIL_DOMAIN)) return false;
   if (p.email_verified === false) return false;
   const groups = Array.isArray(p.groups)
      ? p.groups.map(normalizeGroup).filter((g): g is string => g !== null)
      : [];
   return groups.includes(REQUIRED_GROUP);
}

export const authConfig: NextAuthConfig = {
   session: { strategy: 'jwt' },
   trustHost: true,
   pages: { signIn: '/login' },
   secret: process.env.AUTH_SECRET,
   providers: [
      Keycloak({
         clientId: process.env.AUTH_KEYCLOAK_ID,
         clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
         issuer: process.env.AUTH_KEYCLOAK_ISSUER,
      }),
   ],
};
