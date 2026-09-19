import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { POST as createTeamRoute } from '@/app/api/v1/teams/route';
import { POST as createLabelRoute } from '@/app/api/v1/labels/route';

/**
 * ad#3 — nome > coluna do banco (varchar) virava 500 cru (erro do driver Postgres) em
 * vez de um 400 com mensagem legível. `z.max` na rota barra antes do INSERT.
 */
const ME = 'dev@nimbloo.ai';
let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedUser(db, { name: 'Dev', email: ME, role: 'Admin' });
});
afterEach(() => __setTestDb(null));

function postJson(url: string, body: unknown) {
   return new Request(url, {
      method: 'POST',
      headers: { 'x-forwarded-email': ME, 'content-type': 'application/json' },
      body: JSON.stringify(body),
   });
}

describe('nome longo demais vira 400, não 500 (ad#3)', () => {
   it('criar time com nome > 128 chars é 400, não 500', async () => {
      const res = await createTeamRoute(
         postJson('http://x/api/v1/teams', { id: 'LNG', name: 'x'.repeat(200) })
      );
      expect(res.status).toBe(400);
   });

   it('criar label com nome > 128 chars é 400, não 500', async () => {
      const res = await createLabelRoute(
         postJson('http://x/api/v1/labels', { name: 'x'.repeat(200), color: 'blue' })
      );
      expect(res.status).toBe(400);
   });
});
