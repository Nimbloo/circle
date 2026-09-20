import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb } from './helpers/db';
import { review, reviewFile } from '@/db/schema';
import { listReviews } from '@/lib/api/reviews';
import { generateReviewGuide } from '@/lib/api/review-guide';
import { subscribe, type CircleEvent } from '@/lib/api/events';

/**
 * Baixas Co (reviews): filtro de status no SERVIDOR com vários status (a lista filtrava
 * só a página carregada), e o guia com dedupe de geração concorrente + evento.
 */
type Db = Awaited<ReturnType<typeof makeTestDb>>;
let db: Db;

beforeAll(async () => {
   db = await makeTestDb();
   const base = { repo: 'x/y', createdAt: new Date('2026-09-01T00:00:00Z') };
   await db.insert(review).values([
      { ...base, id: 'x/y#1', prNumber: 1, title: 'a', status: 'open' },
      { ...base, id: 'x/y#2', prNumber: 2, title: 'b', status: 'merged' },
      { ...base, id: 'x/y#3', prNumber: 3, title: 'c', status: 'closed' },
   ]);
   await db.insert(reviewFile).values({
      reviewId: 'x/y#1',
      path: 'src/a.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: '@@ -1 +1 @@\n-a\n+b',
   });
});

describe('listReviews com vários status', () => {
   it('filtra por um conjunto de status e conta o total do conjunto', async () => {
      const page = await listReviews(db, { statuses: ['open', 'merged'] });
      expect(page.items.map((r) => r.id).sort()).toEqual(['x/y#1', 'x/y#2']);
      expect(page.total).toBe(2);
   });

   it('`status` único continua aceito', async () => {
      const page = await listReviews(db, { status: 'closed' });
      expect(page.items.map((r) => r.id)).toEqual(['x/y#3']);
   });
});

describe('guia: dedupe e evento', () => {
   it('gerações concorrentes do mesmo review chamam o modelo uma vez e publicam', async () => {
      let calls = 0;
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const invoke = async () => {
         calls += 1;
         await gate;
         return JSON.stringify({
            sections: [{ title: 'T', paragraphs: ['p'], fileRefs: [], diffName: 'a.ts' }],
         });
      };
      const events: CircleEvent[] = [];
      const stop = subscribe((e) => events.push(e));
      const first = generateReviewGuide(db, 'x/y#1', { invoke });
      const second = generateReviewGuide(db, 'x/y#1', { invoke });
      release();
      const [a, b] = await Promise.all([first, second]);
      stop();
      expect(calls).toBe(1);
      expect(a.generatedAt).toBe(b.generatedAt);
      expect(events.filter((e) => e.entity === 'review' && e.id === 'x/y#1')).toHaveLength(1);
   });
});
