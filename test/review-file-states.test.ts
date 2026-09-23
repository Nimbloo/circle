import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { review, reviewFileState } from '@/db/schema';
import type { Db } from '@/db';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { listReviewedPaths, setReviewFileState } from '@/lib/api/review-file-states';

const REVIEW_ID = 'x/y#7';
const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';

async function seed(): Promise<Db> {
   const db = await makeTestDb();
   await seedUser(db, { name: 'Ana', email: ANA });
   await seedUser(db, { name: 'Bob', email: BOB });
   await db
      .insert(review)
      .values({ id: REVIEW_ID, title: 'Fix combobox', status: 'open', repo: 'x/y', prNumber: 7 });
   return db;
}

describe('review file states ("Reviewed" persistido)', () => {
   it('marca e desmarca um arquivo; escopo por usuário', async () => {
      const db = await seed();
      expect(await listReviewedPaths(db, REVIEW_ID, ANA)).toEqual([]);

      await setReviewFileState(db, REVIEW_ID, ANA, 'src/a.ts', true);
      await setReviewFileState(db, REVIEW_ID, ANA, 'src/b.ts', true);
      expect((await listReviewedPaths(db, REVIEW_ID, ANA)).sort()).toEqual([
         'src/a.ts',
         'src/b.ts',
      ]);

      // Bob não vê o que Ana marcou (escopo por usuário).
      expect(await listReviewedPaths(db, REVIEW_ID, BOB)).toEqual([]);

      await setReviewFileState(db, REVIEW_ID, ANA, 'src/a.ts', false);
      expect(await listReviewedPaths(db, REVIEW_ID, ANA)).toEqual(['src/b.ts']);
   });

   it('marcar de novo o mesmo arquivo é idempotente (upsert, sem duplicar)', async () => {
      const db = await seed();
      await setReviewFileState(db, REVIEW_ID, ANA, 'src/a.ts', true);
      await setReviewFileState(db, REVIEW_ID, ANA, 'src/a.ts', true);
      const rows = await db.select().from(reviewFileState);
      expect(rows).toHaveLength(1);
   });

   it('desmarcar um arquivo nunca marcado não lança e não cria linha', async () => {
      const db = await seed();
      await expect(
         setReviewFileState(db, REVIEW_ID, ANA, 'src/never.ts', false)
      ).resolves.toMatchObject({ reviewed: false });
      expect(await db.select().from(reviewFileState)).toHaveLength(0);
   });

   it('review inexistente é 404', async () => {
      const db = await seed();
      await expect(setReviewFileState(db, 'nope#1', ANA, 'x.ts', true)).rejects.toMatchObject({
         status: 404,
      });
      await expect(listReviewedPaths(db, 'nope#1', ANA)).rejects.toMatchObject({ status: 404 });
   });

   it('publica `review` com recipientId do usuário (outras abas do mesmo usuário)', async () => {
      const db = await seed();
      const received: CircleEvent[] = [];
      const unsub = subscribe((e) => {
         if (e.entity === 'review') received.push(e);
      });
      try {
         await setReviewFileState(db, REVIEW_ID, ANA, 'src/a.ts', true);
      } finally {
         unsub();
      }
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ id: REVIEW_ID, action: 'updated' });
      expect(received[0].recipientId).toBeTruthy();
   });
});
