import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { __setTestDb } from '@/db';
import { POST as sentryCreate } from '@/app/api/v1/integrations/sentry/issues/create/route';
import { POST as sentryLink } from '@/app/api/v1/integrations/sentry/issues/link/route';

/**
 * O corpo do Sentry é assinado, mas o TIPO dos campos não é garantido: `title` ou
 * `identifier` que não seja string estourava `.trim()` e virava 500 (no link, sem nem
 * passar pelo catch). Campo de tipo errado é erro do cliente: 400.
 */

const SECRET = 'sentry-secret';

function signed(url: string, body: unknown) {
   const raw = JSON.stringify(body);
   const sig = createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex');
   return new Request(url, {
      method: 'POST',
      body: raw,
      headers: { 'content-type': 'application/json', 'sentry-hook-signature': sig },
   });
}

beforeEach(async () => {
   vi.stubEnv('CIRCLE_SENTRY_CLIENT_SECRET', SECRET);
   const db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   __setTestDb(db);
});
afterEach(() => {
   __setTestDb(null);
   vi.unstubAllEnvs();
});

describe('Sentry: campos de tipo errado → 400', () => {
   it('create com title não-string', async () => {
      for (const title of [123, { a: 1 }, ['x'], true]) {
         const res = await sentryCreate(
            signed('http://x/api/v1/integrations/sentry/issues/create', {
               fields: { title, teamId: 'CORE' },
            })
         );
         expect(res.status, JSON.stringify(title)).toBe(400);
         expect(res.headers.get('content-type')).toContain('application/problem+json');
         const body = await res.json();
         expect(body.status).toBe(400);
         expect(body.error).toBeTruthy(); // shape antigo do Sentry preservado
      }
   });

   it('link com identifier não-string', async () => {
      for (const identifier of [42, { a: 1 }, ['CORE-1']]) {
         const res = await sentryLink(
            signed('http://x/api/v1/integrations/sentry/issues/link', {
               fields: { identifier },
            })
         );
         expect(res.status, JSON.stringify(identifier)).toBe(400);
         expect(res.headers.get('content-type')).toContain('application/problem+json');
      }
   });
});
