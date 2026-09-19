import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { createFolder, createDocument, updateDocument, deleteDocument } from '@/lib/api/documents';
import { requestToJoin, listJoinRequests, decideJoinRequest } from '@/lib/api/teams';

/** #58: documento e solicitação de entrada chegam ao vivo à tela do time certo. */
const ME = 'dev@nimbloo.ai';
let db: Db;
let eventos: CircleEvent[];
let parar: () => void;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE', 'Core');
   await seedUser(db, { name: 'Dev', email: ME, teamIds: ['CORE'] });
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => {
   parar();
   __setTestDb(null);
});

describe('eventos de documento com teamId (#58)', () => {
   it('pasta e documento (criar, editar, apagar) levam o time', async () => {
      const folder = await createFolder(db, { teamId: 'CORE', name: 'Specs' }, ME);
      const doc = await createDocument(
         db,
         { folderId: folder.id, teamId: 'CORE', name: 'RFC' },
         ME
      );
      await updateDocument(db, doc.id, { pinned: true }, ME);
      await deleteDocument(db, doc.id, ME);
      const docs = eventos.filter((e) => e.entity === 'document');
      expect(docs.map((e) => [e.action, e.teamId])).toEqual([
         ['created', 'CORE'],
         ['created', 'CORE'],
         ['updated', 'CORE'],
         ['deleted', 'CORE'],
      ]);
   });
});

describe('solicitação de entrada ao vivo (#58)', () => {
   it('pedir e decidir avisam a tela do time (evento team com teamId)', async () => {
      await seedUser(db, { name: 'Fora', email: 'fora@nimbloo.ai', teamIds: [] });
      const { getOrCreateUser } = await import('@/lib/api/users');
      const admin = await getOrCreateUser(db, ME);
      await requestToJoin(db, 'CORE', 'fora@nimbloo.ai');
      const [req] = await listJoinRequests(db, 'CORE');
      await decideJoinRequest(db, 'CORE', req.id, 'denied', admin.id);
      const team = eventos.filter((e) => e.entity === 'team');
      expect(team.map((e) => [e.id, e.teamId])).toEqual([
         ['CORE', 'CORE'],
         ['CORE', 'CORE'],
      ]);
   });
});
