import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { createNotification } from '@/lib/api/notifications';
import { GET as getInbox } from '@/app/api/v1/inbox/route';
import { DELETE as deleteNotificationRoute } from '@/app/api/v1/notifications/[id]/route';

/** co#3 — contrato das rotas: página por cursor (meta.nextCursor) e DELETE escopado. */
const ME = 'ana@nimbloo.ai';
let db: Db;
let me = '';
let other = '';
const ids: string[] = [];

const req = (url: string, init: RequestInit = {}, email = ME) =>
   new Request(url, { ...init, headers: { 'x-forwarded-email': email } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   me = await seedUser(db, { name: 'Ana', email: ME });
   other = await seedUser(db, { name: 'Bia', email: 'bia@nimbloo.ai' });
   ids.length = 0;
   for (let i = 0; i < 5; i++)
      ids.push(await createNotification(db, { recipientId: me, type: 'comment' }));
   await createNotification(db, { recipientId: other, type: 'comment' });
});
afterEach(() => __setTestDb(null));

describe('GET /inbox — paginação', () => {
   it('sem cursor mantém o array em data e devolve meta.nextCursor', async () => {
      const res = await getInbox(req('http://x/api/v1/inbox?limit=2'));
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(typeof body.meta.nextCursor).toBe('string');
      const next = await getInbox(
         req(`http://x/api/v1/inbox?limit=10&cursor=${body.meta.nextCursor}`)
      );
      const rest = (await next.json()) as { data: { id: string }[]; meta: { nextCursor: null } };
      expect(rest.data).toHaveLength(3);
      expect(rest.meta.nextCursor).toBeNull();
   });

   it('limit inválido vira 400', async () => {
      const res = await getInbox(req('http://x/api/v1/inbox?limit=abc'));
      expect(res.status).toBe(400);
   });
});

describe('DELETE /notifications/:id', () => {
   it('exclui a própria e dá 404 para a de outro usuário', async () => {
      const ok = await deleteNotificationRoute(
         req(`http://x/api/v1/notifications/${ids[0]}`, { method: 'DELETE' }),
         params(ids[0])
      );
      expect(ok.status).toBe(200);
      expect((await ok.json()).data).toEqual({ id: ids[0], deleted: true });
      const again = await deleteNotificationRoute(
         req(`http://x/api/v1/notifications/${ids[1]}`, { method: 'DELETE' }, 'bia@nimbloo.ai'),
         params(ids[1])
      );
      expect(again.status).toBe(404);
   });
});
