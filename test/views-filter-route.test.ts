import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { POST as createViewRoute } from '@/app/api/v1/views/route';
import { PATCH as patchViewRoute } from '@/app/api/v1/views/[id]/route';

/**
 * #6 — views salvas perdiam `assigneeIds`/`projectIds`: o `FilterSchema` das rotas não
 * declarava os campos e o zod os descartava em silêncio. O teste passa PELA ROTA, que é
 * onde o schema vivia duplicado (POST e PATCH).
 */

const ANA = 'ana@nimbloo.ai';
let db: Db;

function req(url: string, init: RequestInit = {}) {
   return new Request(url, {
      ...init,
      headers: { 'x-forwarded-email': ANA, 'content-type': 'application/json' },
   });
}

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA, teamIds: ['CORE'] });
});
afterEach(() => __setTestDb(null));

describe('filtro da view pela rota (#6)', () => {
   it('POST e PATCH preservam assigneeIds e projectIds', async () => {
      const created = await createViewRoute(
         req('http://x/api/v1/views', {
            method: 'POST',
            body: JSON.stringify({
               slug: 'da-ana',
               name: 'Da Ana',
               type: 'issue',
               filter: { assigneeIds: ['u1'], projectIds: ['p1'], unassigned: true },
            }),
         })
      );
      expect(created.status).toBe(200);
      const view = (await created.json()).data;
      expect(view.filter).toMatchObject({ assigneeIds: ['u1'], projectIds: ['p1'] });

      const patched = await patchViewRoute(
         req('http://x/api/v1/views/' + view.id, {
            method: 'PATCH',
            body: JSON.stringify({ filter: { assigneeIds: ['u2'], projectIds: ['p2'] } }),
         }),
         { params: Promise.resolve({ id: view.id }) }
      );
      expect(patched.status).toBe(200);
      expect((await patched.json()).data.filter).toMatchObject({
         assigneeIds: ['u2'],
         projectIds: ['p2'],
      });
   });
});
