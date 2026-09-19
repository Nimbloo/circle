import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { documentFolder, teamDocument } from '@/db/schema';
import { createDocument } from '@/lib/api/documents';
import { POST as createRoute } from '@/app/api/v1/teams/[teamKey]/documents/route';

/**
 * Ad#37 — criar documento numa pasta nova fazia dois POSTs; se o do documento falhava,
 * a pasta ficava órfã (vazia). Agora pasta nova + documento vão numa transação só.
 */
const ME = 'dev@nimbloo.ai';
let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE', 'Core');
   await seedUser(db, { name: 'Dev', email: ME, teamIds: ['CORE'] });
});
afterEach(() => __setTestDb(null));

describe('documento em pasta nova (Ad#37)', () => {
   it('cria a pasta e o documento juntos', async () => {
      const doc = await createDocument(
         db,
         { teamId: 'CORE', newFolder: { name: 'Specs', icon: '📁' }, name: 'RFC' },
         ME
      );
      const folders = await db.select().from(documentFolder);
      expect(folders).toHaveLength(1);
      expect(folders[0]).toMatchObject({ id: doc.folderId, name: 'Specs', teamId: 'CORE' });
   });

   it('se o documento falha, a pasta nova não fica órfã', async () => {
      await expect(
         createDocument(
            db,
            { teamId: 'CORE', newFolder: { name: 'Specs' }, name: 'x'.repeat(500) },
            ME
         )
      ).rejects.toBeTruthy();
      expect(await db.select().from(documentFolder)).toHaveLength(0);
      expect(await db.select().from(teamDocument)).toHaveLength(0);
   });

   it('a rota aceita `newFolder` no lugar de `folderId` (aditivo)', async () => {
      const res = await createRoute(
         new Request('http://x/api/v1/teams/CORE/documents', {
            method: 'POST',
            headers: { 'x-forwarded-email': ME, 'content-type': 'application/json' },
            body: JSON.stringify({ kind: 'document', newFolder: { name: 'Specs' }, name: 'RFC' }),
         }),
         { params: Promise.resolve({ teamKey: 'CORE' }) }
      );
      expect(res.status).toBe(200);
      expect(await db.select().from(documentFolder)).toHaveLength(1);
   });

   it('sem folderId nem newFolder é 400', async () => {
      await expect(createDocument(db, { teamId: 'CORE', name: 'RFC' }, ME)).rejects.toMatchObject({
         status: 400,
      });
   });
});
