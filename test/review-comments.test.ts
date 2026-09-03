import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { review } from '@/db/schema';
import type { Db } from '@/db';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { getReview } from '@/lib/api/reviews';
import {
   addReviewComment,
   deleteReviewComment,
   latestVerdict,
   listReviewComments,
   updateReviewComment,
} from '@/lib/api/review-comments';

const REVIEW_ID = 'x/y#7';
const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';
const ADMIN = 'root@nimbloo.ai';

async function seed(): Promise<Db> {
   const db = await makeTestDb();
   await seedUser(db, { name: 'Ana', email: ANA });
   await seedUser(db, { name: 'Bob', email: BOB });
   await seedUser(db, { name: 'Root', email: ADMIN, role: 'Admin' });
   await db
      .insert(review)
      .values({ id: REVIEW_ID, title: 'Fix combobox', status: 'open', repo: 'x/y', prNumber: 7 });
   return db;
}

describe('review comments (CRUD)', () => {
   it('cria comentário geral, por arquivo e por linha, e lista em ordem cronológica', async () => {
      const db = await seed();
      const general = await addReviewComment(db, REVIEW_ID, { body: 'LGTM overall' }, ANA);
      const file = await addReviewComment(
         db,
         REVIEW_ID,
         { body: 'rename this file', path: 'src/a.ts' },
         BOB
      );
      const line = await addReviewComment(
         db,
         REVIEW_ID,
         { body: 'off by one', path: 'src/a.ts', line: 12 },
         ANA
      );

      expect(general).toMatchObject({
         reviewId: REVIEW_ID,
         kind: 'comment',
         path: null,
         line: null,
         author: { name: 'Ana', avatarUrl: null },
      });
      expect(file).toMatchObject({ path: 'src/a.ts', line: null });
      expect(line).toMatchObject({ path: 'src/a.ts', line: 12 });

      const list = await listReviewComments(db, REVIEW_ID);
      expect(list.map((c) => c.id)).toEqual([general.id, file.id, line.id]);
      expect(list[1].author?.name).toBe('Bob');
   });

   it('404 em review inexistente; 400 em linha sem path e em comentário vazio', async () => {
      const db = await seed();
      await expect(addReviewComment(db, 'nope#1', { body: 'x' }, ANA)).rejects.toMatchObject({
         status: 404,
      });
      await expect(
         addReviewComment(db, REVIEW_ID, { body: 'x', line: 3 }, ANA)
      ).rejects.toMatchObject({ status: 400 });
      await expect(addReviewComment(db, REVIEW_ID, { body: '   ' }, ANA)).rejects.toMatchObject({
         status: 400,
      });
   });

   it('veredito pode ir sem texto e getReview expõe o último como verdict', async () => {
      const db = await seed();
      expect((await getReview(db, REVIEW_ID))?.verdict).toBeNull();

      await addReviewComment(db, REVIEW_ID, { body: '', kind: 'approve' }, ANA);
      await addReviewComment(db, REVIEW_ID, { body: 'just a note' }, BOB);
      let detail = await getReview(db, REVIEW_ID);
      expect(detail?.comments).toHaveLength(2);
      expect(detail?.verdict).toMatchObject({ kind: 'approve', author: { name: 'Ana' } });

      await addReviewComment(db, REVIEW_ID, { body: 'needs tests', kind: 'request_changes' }, BOB);
      detail = await getReview(db, REVIEW_ID);
      expect(detail?.verdict).toMatchObject({ kind: 'request_changes', author: { name: 'Bob' } });
      expect(latestVerdict([])).toBeNull();
   });

   it('autor edita o próprio comentário; outro usuário recebe 403', async () => {
      const db = await seed();
      const c = await addReviewComment(db, REVIEW_ID, { body: 'draft' }, ANA);
      const updated = await updateReviewComment(db, REVIEW_ID, c.id, 'final', ANA);
      expect(updated?.body).toBe('final');
      expect(updated?.author?.name).toBe('Ana');
      await expect(updateReviewComment(db, REVIEW_ID, c.id, 'hack', BOB)).rejects.toMatchObject({
         status: 403,
      });
      // Comentário de outro review (ou inexistente) → null (404 na rota).
      expect(await updateReviewComment(db, 'other#1', c.id, 'x', ANA)).toBeNull();
   });

   it('autor exclui o próprio; admin exclui de qualquer um; terceiro recebe 403', async () => {
      const db = await seed();
      const mine = await addReviewComment(db, REVIEW_ID, { body: 'mine' }, ANA);
      const theirs = await addReviewComment(db, REVIEW_ID, { body: 'theirs' }, BOB);

      await expect(deleteReviewComment(db, REVIEW_ID, theirs.id, ANA)).rejects.toMatchObject({
         status: 403,
      });
      expect(await deleteReviewComment(db, REVIEW_ID, mine.id, ANA)).toBe(true);
      expect(await deleteReviewComment(db, REVIEW_ID, theirs.id, ADMIN)).toBe(true);
      expect(await deleteReviewComment(db, REVIEW_ID, theirs.id, ADMIN)).toBe(false);
      expect(await listReviewComments(db, REVIEW_ID)).toEqual([]);
   });

   it('publica review_comment com o id do REVIEW em create/update/delete', async () => {
      const db = await seed();
      const received: CircleEvent[] = [];
      const unsub = subscribe((e) => {
         if (e.entity === 'review_comment') received.push(e);
      });
      try {
         const c = await addReviewComment(db, REVIEW_ID, { body: 'a' }, ANA);
         await updateReviewComment(db, REVIEW_ID, c.id, 'b', ANA);
         await deleteReviewComment(db, REVIEW_ID, c.id, ANA);
      } finally {
         unsub();
      }
      expect(received.map((e) => e.action)).toEqual(['created', 'updated', 'deleted']);
      expect(received.every((e) => e.id === REVIEW_ID && e.actorEmail === ANA)).toBe(true);
   });
});
