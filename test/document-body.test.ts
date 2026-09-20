import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { documentFolder, teamDocument } from '@/db/schema';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import {
   createDocument,
   createFolder,
   deleteFolder,
   getDocument,
   updateDocument,
   updateFolder,
} from '@/lib/api/documents';
import { GET as getRoute, PATCH as patchRoute } from '@/app/api/v1/documents/[id]/route';
import {
   PATCH as patchFolderRoute,
   DELETE as deleteFolderRoute,
} from '@/app/api/v1/document-folders/[id]/route';
import type { EditorDoc } from '@/lib/editor-doc';

const ME = 'dev@nimbloo.ai';
const OTHER = 'ana@nimbloo.ai';
const OUTSIDER = 'zed@nimbloo.ai';
let db: Db;
let eventos: CircleEvent[];
let parar: () => void;

const doc = (text: string): EditorDoc => ({
   type: 'doc',
   content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE', 'Core');
   await seedTeam(db, 'WEB', 'Web');
   await seedUser(db, { name: 'Dev', email: ME, teamIds: ['CORE'] });
   await seedUser(db, { name: 'Ana', email: OTHER, teamIds: ['CORE'] });
   await seedUser(db, { name: 'Zed', email: OUTSIDER, role: 'Guest', teamIds: ['WEB'] });
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => {
   parar();
   __setTestDb(null);
});

async function seedDoc() {
   const folder = await createFolder(db, { teamId: 'CORE', name: 'Specs' }, ME);
   return createDocument(db, { folderId: folder.id, teamId: 'CORE', name: 'RFC' }, ME);
}

describe('corpo do documento (editor de blocos)', () => {
   it('documento novo nasce sem corpo e com versão', async () => {
      const created = await seedDoc();
      const dto = await getDocument(db, created.id);
      expect(dto).toMatchObject({ id: created.id, teamId: 'CORE', descriptionDoc: null });
      expect(dto?.descriptionVersion).toBeTruthy();
   });

   it('grava o corpo com a versão vista, troca a versão e publica evento com teamId', async () => {
      const created = await seedDoc();
      const before = (await getDocument(db, created.id))!;
      eventos = [];
      const after = await updateDocument(
         db,
         created.id,
         { descriptionDoc: doc('Olá'), expectedDescriptionVersion: before.descriptionVersion },
         ME
      );
      expect(after?.descriptionDoc).toEqual(doc('Olá'));
      expect(after?.descriptionVersion).not.toBe(before.descriptionVersion);
      expect(eventos.map((e) => [e.entity, e.action, e.id, e.teamId])).toEqual([
         ['document', 'updated', created.id, 'CORE'],
      ]);
   });

   it('versão velha dá 409 e não grava (outra pessoa editou no meio)', async () => {
      const created = await seedDoc();
      const before = (await getDocument(db, created.id))!;
      await updateDocument(
         db,
         created.id,
         { descriptionDoc: doc('A'), expectedDescriptionVersion: before.descriptionVersion },
         OTHER
      );
      await expect(
         updateDocument(
            db,
            created.id,
            { descriptionDoc: doc('B'), expectedDescriptionVersion: before.descriptionVersion },
            ME
         )
      ).rejects.toMatchObject({ status: 409 });
      expect((await getDocument(db, created.id))?.descriptionDoc).toEqual(doc('A'));
   });

   it('qualquer membro do time edita o corpo; quem é de fora não (403)', async () => {
      const created = await seedDoc();
      await expect(
         updateDocument(db, created.id, { descriptionDoc: doc('x') }, OTHER)
      ).resolves.toBeTruthy();
      await expect(
         updateDocument(db, created.id, { descriptionDoc: doc('y') }, OUTSIDER)
      ).rejects.toMatchObject({ status: 403 });
      // Renomear continua só do criador (ou admin).
      await expect(updateDocument(db, created.id, { name: 'Outro' }, OTHER)).rejects.toMatchObject({
         status: 403,
      });
   });

   it('doc vazio limpa o corpo (uma forma só de "sem corpo")', async () => {
      const created = await seedDoc();
      await updateDocument(db, created.id, { descriptionDoc: doc('x') }, ME);
      const cleared = await updateDocument(
         db,
         created.id,
         { descriptionDoc: { type: 'doc', content: [{ type: 'paragraph' }] } },
         ME
      );
      expect(cleared?.descriptionDoc).toBeNull();
   });

   it('rotas: GET devolve o corpo; PATCH aceita descriptionDoc; convidado de outro time não lê', async () => {
      const created = await seedDoc();
      const params = { params: Promise.resolve({ id: created.id }) };
      const req = (email: string, init?: RequestInit) =>
         new Request(`http://x/api/v1/documents/${created.id}`, {
            ...init,
            headers: { 'x-forwarded-email': email, 'content-type': 'application/json' },
         });
      const patched = await patchRoute(
         req(ME, { method: 'PATCH', body: JSON.stringify({ descriptionDoc: doc('Rota') }) }),
         params
      );
      expect(patched.status).toBe(200);
      const got = await getRoute(req(ME), params);
      expect(got.status).toBe(200);
      const body = await got.json();
      expect(body.data.descriptionDoc).toEqual(doc('Rota'));
      expect(body.data.id).toBe(created.id);
      const outsider = await getRoute(req(OUTSIDER), params);
      expect(outsider.status).toBe(403);
   });
});

describe('pastas de documento: renomear e excluir', () => {
   it('renomeia a pasta (membro do time) com evento do time', async () => {
      const folder = await createFolder(db, { teamId: 'CORE', name: 'Specs' }, ME);
      eventos = [];
      const renamed = await updateFolder(db, folder.id, { name: '  RFCs ', icon: '📚' }, OTHER);
      expect(renamed).toMatchObject({ id: folder.id, name: 'RFCs', icon: '📚' });
      expect(eventos.map((e) => [e.entity, e.teamId])).toEqual([['document', 'CORE']]);
      await expect(updateFolder(db, folder.id, { name: 'X' }, OUTSIDER)).rejects.toMatchObject({
         status: 403,
      });
   });

   it('exclui a pasta vazia', async () => {
      const folder = await createFolder(db, { teamId: 'CORE', name: 'Vazia' }, ME);
      expect(await deleteFolder(db, folder.id, OTHER)).toBe(true);
      expect(await db.select().from(documentFolder)).toHaveLength(0);
   });

   it('excluir pasta com documentos apaga-os junto se o ator pode apagar todos', async () => {
      const created = await seedDoc();
      // Ana não é dona do documento: recusa, nada é apagado.
      await expect(deleteFolder(db, created.folderId, OTHER)).rejects.toMatchObject({
         status: 403,
      });
      expect(await db.select().from(teamDocument)).toHaveLength(1);
      // O criador pode.
      expect(await deleteFolder(db, created.folderId, ME)).toBe(true);
      expect(await db.select().from(teamDocument)).toHaveLength(0);
      expect(await db.select().from(documentFolder)).toHaveLength(0);
   });

   it('rotas de pasta: PATCH e DELETE', async () => {
      const folder = await createFolder(db, { teamId: 'CORE', name: 'Specs' }, ME);
      const params = { params: Promise.resolve({ id: folder.id }) };
      const headers = { 'x-forwarded-email': ME, 'content-type': 'application/json' };
      const res = await patchFolderRoute(
         new Request('http://x', {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ name: 'Docs' }),
         }),
         params
      );
      expect(res.status).toBe(200);
      const del = await deleteFolderRoute(
         new Request('http://x', { method: 'DELETE', headers }),
         params
      );
      expect(del.status).toBe(200);
      const missing = await deleteFolderRoute(
         new Request('http://x', { method: 'DELETE', headers }),
         params
      );
      expect(missing.status).toBe(404);
   });
});
