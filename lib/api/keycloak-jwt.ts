/**
 * Validação de Bearer JWT emitido pelo Keycloak — para auth de MÁQUINA na API
 * (service accounts via client_credentials), coerente com o SSO único.
 *
 * EDGE-SAFE: usa Web Crypto (`crypto.subtle`), `atob` e `TextEncoder` — NÃO
 * `node:crypto`/`Buffer` — para poder rodar TANTO no gate do middleware (Edge)
 * QUANTO nas rotas (Node). Verifica RS256 contra o JWKS público do realm
 * (`${issuer}/protocol/openid-connect/certs`), com cache em memória. RS256 é
 * HARDCODED — qualquer outro `alg` (incl. `none`/HS*) é rejeitado (previne
 * alg-confusion). Valida `iss` e `exp`.
 *
 * QUEM PODE: só token de SERVICE ACCOUNT (`client_credentials`). Um token de
 * PESSOA — inclusive o do Grafana, que hoje emite com escopo completo e por isso
 * carrega as roles do Circle — é recusado nesta porta: gente entra pela sessão.
 * É isto que substitui a antiga allowlist de clients em variável de ambiente, que
 * era um segundo lugar (e um deploy) para dar acesso. Agora o único lugar é o
 * Keycloak: quem chama é quem tem service account COM client role de `circle`.
 *
 * Identidade: sempre `service-account-<client>@circle.local`, derivada do `azp`. O
 * e-mail do token é ignorado de propósito — um robô é ele mesmo, nunca uma pessoa.
 */

interface Jwk {
   kid: string;
   kty: string;
   alg?: string;
   use?: string;
   n: string;
   e: string;
}

interface JwksCache {
   keys: Jwk[];
   fetchedAt: number;
}

const JWKS_TTL_MS = 10 * 60 * 1000; // 10 min
const FORCED_REFRESH_THROTTLE_MS = 60 * 1000; // no máx 1 refetch forçado/min
let cache: JwksCache | null = null;
let lastForcedRefreshAt = 0;

/**
 * `true` quando o token foi emitido por `client_credentials`. O Keycloak nomeia o
 * usuário do service account como `service-account-<clientId>` — é o que separa,
 * no próprio token, a máquina da pessoa.
 */
function isServiceAccount(payload: Record<string, unknown>): boolean {
   const azp = payload.azp;
   const username = payload.preferred_username;
   if (typeof azp !== 'string' || !azp) return false;
   return (
      typeof username === 'string' &&
      username.toLowerCase() === `service-account-${azp.toLowerCase()}`
   );
}

/** Decodifica um segmento base64url (edge-safe, sem Buffer). */
function b64urlToBytes(seg: string): Uint8Array {
   const b64 = seg
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(seg.length / 4) * 4, '=');
   const bin = atob(b64);
   const bytes = new Uint8Array(bin.length);
   for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
   return bytes;
}

function b64urlToJson(seg: string): Record<string, unknown> {
   const text = new TextDecoder().decode(b64urlToBytes(seg));
   return JSON.parse(text) as Record<string, unknown>;
}

function issuer(): string | null {
   const iss = process.env.AUTH_KEYCLOAK_ISSUER?.replace(/\/$/, '');
   return iss || null;
}

async function getJwks(iss: string): Promise<Jwk[]> {
   if (cache && Date.now() - cache.fetchedAt < JWKS_TTL_MS) return cache.keys;
   const res = await fetch(`${iss}/protocol/openid-connect/certs`, { cache: 'no-store' });
   if (!res.ok) throw new Error(`JWKS fetch falhou: ${res.status}`);
   const body = (await res.json()) as { keys?: Jwk[] };
   const keys = body.keys ?? [];
   cache = { keys, fetchedAt: Date.now() };
   return keys;
}

/**
 * Verifica um Bearer JWT do Keycloak. Retorna o payload validado ou null se
 * inválido (assinatura, issuer, expiração, alg não-RS256). Nunca lança.
 */
export async function verifyKeycloakJwt(token: string): Promise<Record<string, unknown> | null> {
   try {
      const iss = issuer();
      if (!iss) return null;
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [headerB64, payloadB64, sigB64] = parts;

      const header = b64urlToJson(headerB64);
      if (header.alg !== 'RS256') return null; // hardcode: rejeita none/HS*/etc
      const kid = typeof header.kid === 'string' ? header.kid : null;

      // Máquina ANTES de qualquer trabalho caro (assinatura/JWKS): o corte é sobre um
      // claim, então descarta token de pessoa sem pagar verificação, e corta o refetch
      // de JWKS disparado por token alheio. A assinatura ainda é conferida depois — o
      // claim aqui só decide se vale a pena olhar.
      const unverified = b64urlToJson(payloadB64);
      if (!isServiceAccount(unverified)) return null;

      let keys = await getJwks(iss);
      let jwk = keys.find((k) => k.kid === kid && k.kty === 'RSA');
      // kid desconhecido (rotação recente) → força UM refresh, no máx 1x/min (throttle
      // anti-DoS: sem isto, tokens com kid aleatório fariam refetch + cache-thrash a cada
      // request, pré-auth). Fora da janela, rejeita sem refetch.
      if (!jwk && Date.now() - lastForcedRefreshAt > FORCED_REFRESH_THROTTLE_MS) {
         lastForcedRefreshAt = Date.now();
         cache = null;
         keys = await getJwks(iss);
         jwk = keys.find((k) => k.kid === kid && k.kty === 'RSA');
      }
      if (!jwk) return null;

      const key = await crypto.subtle.importKey(
         'jwk',
         { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
         { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
         false,
         ['verify']
      );
      const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
      const signature = b64urlToBytes(sigB64);
      const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput);
      if (!valid) return null;

      const payload = b64urlToJson(payloadB64);
      if (payload.iss !== iss) return null; // issuer exato do realm
      const now = Math.floor(Date.now() / 1000);
      // exp OBRIGATÓRIO (não best-effort): token sem exp jamais expiraria.
      if (typeof payload.exp !== 'number' || payload.exp + 30 < now) return null; // skew 30s
      if (typeof payload.nbf === 'number' && payload.nbf - 30 > now) return null;

      // De novo sobre o payload VERIFICADO — o teste acima foi sobre bytes ainda não
      // conferidos e serve só para descartar cedo.
      if (!isServiceAccount(payload)) return null;

      return payload;
   } catch {
      return null;
   }
}

/**
 * Identidade do app a partir de um payload já validado: o CLIENT que chamou.
 *
 * O `email` do token é ignorado de propósito. Se fosse usado, um service account com
 * e-mail configurado no realm agiria como aquela pessoa — inclusive como um dos
 * `CIRCLE_ADMIN_EMAILS`. Robô é robô.
 */
export function identityFromPayload(payload: Record<string, unknown>): string | null {
   const azp = payload.azp ?? payload.client_id ?? payload.clientId;
   if (typeof azp === 'string' && azp.length > 0)
      return `service-account-${azp.toLowerCase()}@circle.local`;
   return null;
}
