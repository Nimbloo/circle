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
/**
 * IDENTIDADE: e-mail verificado do domínio Nimbloo. É o piso — nada entra sem isto,
 * nem convidado. Separado do grupo porque o convite (ver `auth.ts`) dispensa a
 * associação ao grupo, NUNCA a autenticação.
 */
export function hasNimblooIdentity(profile: unknown): boolean {
   if (!profile || typeof profile !== 'object') return false;
   const p = profile as Record<string, unknown>;
   const email = normalizeEmail(p.email);
   if (!email || !email.endsWith(ALLOWED_EMAIL_DOMAIN)) return false;
   // FAIL-CLOSED, igual ao gate de grupo: exige o claim PRESENTE e true. Antes era
   // `!== false`, então um `email_verified` ausente (mapper fora do realm) passava —
   // fail-open justo na barreira que o convite NÃO pode dispensar.
   return p.email_verified === true;
}

/** AUTORIZAÇÃO padrão: pertencer ao grupo `app-circle` (concedido via Orbis). */
export function hasCircleGroup(profile: unknown): boolean {
   if (!profile || typeof profile !== 'object') return false;
   const p = profile as Record<string, unknown>;
   const groups = Array.isArray(p.groups)
      ? p.groups.map(normalizeGroup).filter((g): g is string => g !== null)
      : [];
   return groups.includes(REQUIRED_GROUP);
}

/**
 * Client id do Circle no realm (`resource_access.<client>.roles`). É o mesmo do
 * `AUTH_KEYCLOAK_ID`, então segue o valor deployado sem env nova.
 */
const CLIENT_ID = process.env.AUTH_KEYCLOAK_ID ?? 'circle';

/**
 * Papéis do produto, na grafia do `app_user.role`. O realm declara hoje só `member`
 * (minúsculo, ver `nimbloo-k8s/nimbloo-eks/keycloak-prd/templates/configmap-realm.yaml`);
 * `admin` e `guest` ainda não existem lá. O casamento é case-insensitive de propósito:
 * não inventa nome novo, aceita a grafia que o realm já usa e passa a valer para as
 * outras assim que o PR do realm as declarar, sem exigir deploy do Circle.
 */
const CIRCLE_ROLES = ['Admin', 'Member', 'Guest'] as const;
export type CircleRole = (typeof CIRCLE_ROLES)[number];

/**
 * Papel do usuário a partir do token, no MESMO padrão do Grafana aqui
 * (`role_attribute_path` + `role_attribute_strict`): a client role manda; quem só tem o
 * grupo `app-circle` cai no piso `Member` (preserva o comportamento de hoje e evita
 * lockout de quem já usa); sem grupo e sem role, `null` — e aí o gate de login nega.
 *
 * Quem atribui e revoga a role é o Orbis, pela Admin API do Keycloak, exatamente como
 * já faz para o Grafana. O Circle nunca escreve no IdP.
 */
export function roleFromProfile(profile: unknown): CircleRole | null {
   if (!profile || typeof profile !== 'object') return null;
   const p = profile as Record<string, unknown>;
   const access = p.resource_access as Record<string, { roles?: unknown }> | undefined;
   const roles = Array.isArray(access?.[CLIENT_ID]?.roles)
      ? (access![CLIENT_ID].roles as unknown[]).map(String)
      : [];
   const lower = roles.map((r) => r.toLowerCase());
   const match = CIRCLE_ROLES.find((r) => lower.includes(r.toLowerCase()));
   if (match) return match;
   return hasCircleGroup(profile) ? 'Member' : null;
}

/** Caminho padrão (sem convite): identidade + grupo. */
export function isAllowedKeycloakProfile(profile: unknown): boolean {
   return hasNimblooIdentity(profile) && hasCircleGroup(profile);
}

export const authConfig: NextAuthConfig = {
   /**
    * SSO TOTAL: quem manda no acesso é o grupo `app-circle` no Keycloak, concedido e
    * revogado pelo Orbis. O gate de login confere isso a CADA login — então o tempo de
    * sessão é o que define em quanto tempo uma revogação vale de fato.
    *
    * Sem `maxAge` o NextAuth usa 30 dias: tirar alguém do grupo não derrubava a sessão
    * viva, e o acesso sobrevivia um mês. 8 horas fecha isso sem atrito perceptível —
    * como o usuário segue logado no Keycloak, a re-autenticação é silenciosa, e é nela
    * que o grupo é reconferido. Corte IMEDIATO continua sendo desativar o membro, que
    * é checado em toda requisição.
    */
   session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
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
