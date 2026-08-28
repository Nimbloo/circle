import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { verifyKeycloakJwt, identityFromPayload } from '@/lib/api/keycloak-jwt';

const ISS = 'https://kc.example.com/realms/nimbloo';
const KID = 'test-key-1';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
   ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
   kid: KID,
   kty: 'RSA',
};

function b64url(obj: unknown): string {
   return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeToken(
   payload: Record<string, unknown>,
   opts: { alg?: string; sign?: boolean } = {}
): string {
   const header = { alg: opts.alg ?? 'RS256', kid: KID, typ: 'JWT' };
   const input = `${b64url(header)}.${b64url(payload)}`;
   if (opts.sign === false) return `${input}.`;
   const sig = cryptoSign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
   return `${input}.${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);
const validPayload = () => ({
   iss: ISS,
   exp: now() + 300,
   azp: 'circle-ci',
   preferred_username: 'service-account-circle-ci',
});

describe('verifyKeycloakJwt', () => {
   beforeEach(() => {
      process.env.AUTH_KEYCLOAK_ISSUER = ISS;
      process.env.CIRCLE_KEYCLOAK_ALLOWED_CLIENTS = 'circle-ci,another';
      vi.stubGlobal(
         'fetch',
         vi.fn(async () => ({ ok: true, json: async () => ({ keys: [jwk] }) }))
      );
   });
   afterEach(() => {
      delete process.env.CIRCLE_KEYCLOAK_ALLOWED_CLIENTS;
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
   });

   it('accepts a valid RS256 token from the realm', async () => {
      const p = await verifyKeycloakJwt(makeToken(validPayload()));
      expect(p).not.toBeNull();
      expect(p!.azp).toBe('circle-ci');
   });

   it('rejects a token with the wrong issuer', async () => {
      const p = await verifyKeycloakJwt(
         makeToken({ ...validPayload(), iss: 'https://evil/realms/x' })
      );
      expect(p).toBeNull();
   });

   it('rejects an expired token', async () => {
      const p = await verifyKeycloakJwt(makeToken({ ...validPayload(), exp: now() - 60 }));
      expect(p).toBeNull();
   });

   it('rejects alg=none (alg-confusion)', async () => {
      const p = await verifyKeycloakJwt(makeToken(validPayload(), { alg: 'none', sign: false }));
      expect(p).toBeNull();
   });

   it('rejects HS256 (alg-confusion)', async () => {
      // Header diz HS256 mas assinatura é RSA — deve ser rejeitado no gate de alg.
      const p = await verifyKeycloakJwt(makeToken(validPayload(), { alg: 'HS256' }));
      expect(p).toBeNull();
   });

   it('rejects a tampered payload', async () => {
      const t = makeToken(validPayload());
      const [h, , s] = t.split('.');
      const forged = `${h}.${b64url({ ...validPayload(), azp: 'admin-client' })}.${s}`;
      expect(await verifyKeycloakJwt(forged)).toBeNull();
   });

   it('returns null when issuer env is unset', async () => {
      delete process.env.AUTH_KEYCLOAK_ISSUER;
      expect(await verifyKeycloakJwt(makeToken(validPayload()))).toBeNull();
   });

   it('rejects a token whose azp is not in the allowlist', async () => {
      const p = await verifyKeycloakJwt(makeToken({ ...validPayload(), azp: 'rogue-client' }));
      expect(p).toBeNull();
   });

   it('rejects all bearer tokens when the allowlist is unset (fail-closed)', async () => {
      delete process.env.CIRCLE_KEYCLOAK_ALLOWED_CLIENTS;
      expect(await verifyKeycloakJwt(makeToken(validPayload()))).toBeNull();
   });

   it('accepts via aud when azp is absent but aud is allowed', async () => {
      const { azp: _omit, ...noAzp } = validPayload();
      const p = await verifyKeycloakJwt(makeToken({ ...noAzp, aud: ['another', 'account'] }));
      expect(p).not.toBeNull();
   });

   it('rejects a token without exp (would never expire)', async () => {
      const { exp: _omit, ...noExp } = validPayload();
      expect(await verifyKeycloakJwt(makeToken(noExp))).toBeNull();
   });
});

describe('identityFromPayload', () => {
   it('prefers the email claim when verified', () => {
      expect(identityFromPayload({ email: 'Bot@Nimbloo.AI', email_verified: true, azp: 'x' })).toBe(
         'bot@nimbloo.ai'
      );
   });
   it('ignores an unverified email and falls back to azp synthesis', () => {
      expect(identityFromPayload({ email: 'spoof@admin.com', azp: 'circle-ci' })).toBe(
         'service-account-circle-ci@circle.local'
      );
   });
   it('synthesizes from azp for service accounts without email', () => {
      expect(identityFromPayload({ azp: 'circle-CI' })).toBe(
         'service-account-circle-ci@circle.local'
      );
   });
   it('returns null with neither', () => {
      expect(identityFromPayload({ sub: 'x' })).toBeNull();
   });
});
