import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import { activityEvent, comment as commentT } from '@/db/schema';
import { listActivity, type ActivityItem } from '@/lib/api/issue-detail';
import { __setTestDb } from '@/db';
import { GET as getActivity } from '@/app/api/v1/issues/[id]/activity/route';

const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const ana = await seedUser(db, { name: 'Ana', email: ANA });
   const bob = await seedUser(db, { name: 'Bob', email: BOB });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ANA
   );
   return { db, issueId: issue.id, ana, bob };
}

/** Datas controladas no futuro: ficam depois do evento `created` da issue. */
const at = (n: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, n));

async function event(db: Db, issueId: string, n: number) {
   const id = randomUUID();
   await db
      .insert(activityEvent)
      .values({ id, issueId, actorId: null, event: 'status', text: `e${n}`, createdAt: at(n) });
   return id;
}

async function comment(
   db: Db,
   issueId: string,
   authorId: string,
   n: number,
   parentId: string | null = null
) {
   const id = randomUUID();
   await db
      .insert(commentT)
      .values({ id, issueId, authorId, body: `c${n}`, parentId, createdAt: at(n) });
   return id;
}

const ids = (items: ActivityItem[]) => items.map((i) => i.id);

describe('feed da issue — janela e threads', () => {
   it('resposta na janela traz a raiz (fora da janela) marcada como contexto', async () => {
      const { db, issueId, ana, bob } = await setup();
      const root = await comment(db, issueId, ana, 1);
      for (let n = 2; n <= 6; n++) await event(db, issueId, n);
      const reply = await comment(db, issueId, bob, 7, root);

      const feed = await listActivity(db, issueId, undefined, 3);
      expect(ids(feed)).toContain(reply);
      const rootItem = feed.find((i) => i.id === root);
      expect(rootItem).toBeTruthy();
      expect(rootItem?.context).toBe(true);
      // a janela em si continua com `limit` itens
      expect(feed.filter((i) => !i.context)).toHaveLength(3);
   });

   it('paginação por cursor devolve a página anterior sem repetir itens', async () => {
      const { db, issueId, ana } = await setup();
      const all: string[] = [];
      for (let n = 1; n <= 7; n++)
         all.push(n % 2 ? await event(db, issueId, n) : await comment(db, issueId, ana, n));

      const page1 = await listActivity(db, issueId, undefined, 3);
      expect(ids(page1)).toEqual(all.slice(4));
      const oldest = page1[0];
      const page2 = await listActivity(db, issueId, undefined, 3, {
         createdAt: oldest.createdAt,
         id: oldest.id,
      });
      expect(ids(page2)).toEqual(all.slice(1, 4));
   });

   it('cursor desempata itens no mesmo instante pelo id', async () => {
      const { db, issueId } = await setup();
      const same = ['a', 'b', 'c', 'd'].map((p) => `${p}0000000-0000-0000-0000-000000000000`);
      for (const id of same)
         await db
            .insert(activityEvent)
            .values({ id, issueId, actorId: null, event: 'status', text: id, createdAt: at(1) });
      const page1 = await listActivity(db, issueId, undefined, 2);
      expect(ids(page1)).toEqual(same.slice(2));
      const page2 = await listActivity(db, issueId, undefined, 2, {
         createdAt: page1[0].createdAt,
         id: page1[0].id,
      });
      expect(ids(page2)).toEqual(same.slice(0, 2));
   });
});

describe('rota de activity — ?before', () => {
   it('aceita before=<createdAt>,<id> e recusa cursor inválido (400)', async () => {
      const { db, issueId } = await setup();
      const all: string[] = [];
      for (let n = 1; n <= 4; n++) all.push(await event(db, issueId, n));
      __setTestDb(db);
      try {
         const call = (qs: string) =>
            getActivity(
               new Request(`http://x/api/v1/issues/${issueId}/activity${qs}`, {
                  headers: { 'x-forwarded-email': ANA },
               }),
               { params: Promise.resolve({ id: issueId }) }
            );
         const res = await (await call('?limit=2')).json();
         const first = res.data as ActivityItem[];
         expect(ids(first)).toEqual(all.slice(2));
         expect(res.meta).toEqual({ hasMore: true });
         const cursor = encodeURIComponent(`${first[0].createdAt},${first[0].id}`);
         const olderRes = await (await call(`?limit=2&before=${cursor}`)).json();
         // página anterior: os 2 eventos seeded + o `created` da issue ficam antes do cursor
         expect(ids(olderRes.data as ActivityItem[])).toEqual(all.slice(0, 2));
         expect(olderRes.meta).toEqual({ hasMore: true });
         expect((await call('?before=lixo')).status).toBe(400);
      } finally {
         __setTestDb(null);
      }
   });
});
