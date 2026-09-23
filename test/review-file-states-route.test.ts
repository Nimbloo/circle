import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { review } from '@/db/schema';
import { __setTestDb } from '@/db';
import { GET as listFileStates } from '@/app/api/v1/reviews/[id]/file-states/route';
import { PUT as setFileState } from '@/app/api/v1/reviews/[id]/file-states/[...path]/route';

const REVIEW_ID = 'x/y#7';
const ANA = 'ana@nimbloo.ai';

async function seed() {
   const db = await makeTestDb();
   __setTestDb(db);
   await seedUser(db, { name: 'Ana', email: ANA });
   await db
      .insert(review)
      .values({ id: REVIEW_ID, title: 'Fix combobox', status: 'open', repo: 'x/y', prNumber: 7 });
   return db;
}

function put(pathSegments: string[], reviewed: boolean) {
   return setFileState(
      new Request(`http://x/api/v1/reviews/${encodeURIComponent(REVIEW_ID)}/file-states/x`, {
         method: 'PUT',
         headers: { 'content-type': 'application/json', 'x-forwarded-email': ANA },
         body: JSON.stringify({ reviewed }),
      }),
      { params: Promise.resolve({ id: REVIEW_ID, path: pathSegments }) }
   );
}

function get() {
   return listFileStates(
      new Request(`http://x/api/v1/reviews/${encodeURIComponent(REVIEW_ID)}/file-states`, {
         headers: { 'x-forwarded-email': ANA },
      }),
      { params: Promise.resolve({ id: REVIEW_ID }) }
   );
}

describe('rota /reviews/{id}/file-states', () => {
   it('PUT marca revisado; GET lista; path com "/" funciona (catch-all)', async () => {
      await seed();

      const putRes = await put(['lib', 'api', 'foo.ts'], true);
      expect(putRes.status).toBe(200);
      expect((await putRes.json()).data).toEqual({ path: 'lib/api/foo.ts', reviewed: true });

      const getRes = await get();
      expect(getRes.status).toBe(200);
      expect((await getRes.json()).data).toEqual(['lib/api/foo.ts']);
   });

   it('PUT reviewed:false desmarca', async () => {
      await seed();
      await put(['a.ts'], true);
      const off = await put(['a.ts'], false);
      expect((await off.json()).data).toEqual({ path: 'a.ts', reviewed: false });
      expect((await (await get()).json()).data).toEqual([]);
   });
});
