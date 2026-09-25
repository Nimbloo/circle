import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { POST as previewRoute } from '@/app/api/v1/import/preview/route';

/**
 * O preview marca `existing` por linha consultando `issue_import` do time pedido. Sem
 * checar o escopo, um guest de outro time conseguia testar externalIds adivinhados de
 * um time que não enxerga (CWE-203).
 */
const GUEST = 'guest@nimbloo.ai';
let db: Db;

function preview(email: string, teamId: string) {
   return previewRoute(
      new Request('http://x/api/v1/import/preview', {
         method: 'POST',
         headers: { 'x-forwarded-email': email, 'content-type': 'application/json' },
         body: JSON.stringify({ source: 'csv', csv: 'ID,Title\nA-1,Um', teamId }),
      })
   );
}

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'OPEN', 'Open');
   await seedTeam(db, 'SECRET', 'Secret');
   await seedUser(db, { name: 'Guest', email: GUEST, role: 'Guest', teamIds: ['OPEN'] });
});
afterEach(() => __setTestDb(null));

describe('POST /import/preview: escopo do time de destino', () => {
   it('recusa com 403 o preview contra um time fora do escopo do ator', async () => {
      const res = await preview(GUEST, 'SECRET');
      expect(res.status).toBe(403);
   });

   it('permite o preview no time do escopo do ator', async () => {
      const res = await preview(GUEST, 'OPEN');
      expect(res.status).toBe(200);
   });
});
