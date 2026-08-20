import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { syncFromGitHub, listReviews, getReview } from '@/lib/api/reviews';

const FAKE_PRS = [
   {
      number: 42,
      title: '[LNUI-701] Fix combobox',
      state: 'open',
      merged_at: null,
      html_url: 'https://github.com/x/y/pull/42',
      created_at: '2026-07-01T00:00:00Z',
      user: { login: 'ana' },
      base: { ref: 'main' },
      head: { ref: 'fix/combobox' },
   },
   {
      number: 40,
      title: 'Refactor tokens',
      state: 'closed',
      merged_at: '2026-06-20T00:00:00Z',
      html_url: 'https://github.com/x/y/pull/40',
      created_at: '2026-06-18T00:00:00Z',
      user: { login: 'bob' },
      base: { ref: 'main' },
      head: { ref: 'refactor' },
   },
];

const fakeFetch = (async () =>
   new Response(JSON.stringify(FAKE_PRS), { status: 200 })) as unknown as typeof fetch;

describe('reviews (GitHub ingestion)', () => {
   it('syncs PRs into review table with status/resolves parsing', async () => {
      const db = await makeTestDb();
      const n = await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      expect(n).toBe(2);

      const reviews = await listReviews(db);
      expect(reviews).toHaveLength(2);
      const merged = reviews.find((r) => r.prNumber === 40)!;
      expect(merged.status).toBe('merged');
      const open = reviews.find((r) => r.prNumber === 42)!;
      expect(open.status).toBe('open');
      expect(open.resolves?.identifier).toBe('LNUI-701'); // parseado do título
   });

   it('is idempotent (re-sync upserts, no dup)', async () => {
      const db = await makeTestDb();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      expect(await listReviews(db)).toHaveLength(2);
   });

   it('syncs many repos in parallel batches (> concorrência)', async () => {
      const db = await makeTestDb();
      const repos = Array.from({ length: 20 }, (_, i) => `org/repo-${i}`);
      const n = await syncFromGitHub(db, { repos, token: 'fake', fetchImpl: fakeFetch });
      expect(n).toBe(40); // 20 repos × 2 PRs
      expect(await listReviews(db)).toHaveLength(40);
   });

   it('gets a review by id and filters by status', async () => {
      const db = await makeTestDb();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      expect((await getReview(db, 'x/y#42'))?.title).toContain('combobox');
      expect(await listReviews(db, { status: 'merged' })).toHaveLength(1);
   });
});
