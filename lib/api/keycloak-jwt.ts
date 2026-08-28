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
 * Identidade: usa o claim `email` se presente; senão sintetiza a partir de
 * `azp`/`client_id` (`service-account-<client>@circle.local`). O usuário é
 * provisionado como Member (mesmo JIT dos humanos); elevar role é ação de admin.
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
let cache: JwksCache | null = null;

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

      let keys = await getJwks(iss);
      let jwk = keys.find((k) => k.kid === kid && k.kty === 'RSA');
      // kid desconhecido (rotação recente) → força um refresh do JWKS uma vez.
      if (!jwk) {
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
      if (typeof payload.exp === 'number' && payload.exp + 30 < now) return null; // skew 30s
      if (typeof payload.nbf === 'number' && payload.nbf - 30 > now) return null;

      return payload;
   } catch {
      return null;
   }
}

/**
 * Extrai o e-mail (identidade do app) de um payload já validado do Keycloak.
 * Prioriza `email`; para service accounts sem e-mail, sintetiza de `azp`/`client_id`.
 */
export function identityFromPayload(payload: Record<string, unknown>): string | null {
   const email = payload.email;
   if (typeof email === 'string' && email.includes('@')) return email.trim().toLowerCase();
   const azp = payload.azp ?? payload.client_id ?? payload.clientId;
   if (typeof azp === 'string' && azp.length > 0)
      return `service-account-${azp.toLowerCase()}@circle.local`;
   return null;
}

/** Conveniência: valida o Bearer e retorna a identidade (e-mail) ou null. */
export async function emailFromBearer(token: string): Promise<string | null> {
   const payload = await verifyKeycloakJwt(token);
   return payload ? identityFromPayload(payload) : null;
}
