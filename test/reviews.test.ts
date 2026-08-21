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

/** É uma URL de detalhe do PR (`/pulls/<n>` sem query) vs. a lista (`/pulls?...`). */
function detailNumber(url: string): number | null {
   const m = url.match(/\/pulls\/(\d+)(?:$|\?)/);
   return m ? Number(m[1]) : null;
}

/**
 * Fake fetch ciente da rota: a lista /pulls devolve FAKE_PRS (sem additions);
 * o GET individual devolve o PR com additions/deletions (única fonte real).
 */
const fakeFetch = (async (url: string) => {
   const num = detailNumber(String(url));
   if (num != null) {
      const pr = FAKE_PRS.find((p) => p.number === num);
      return new Response(
         JSON.stringify({ ...pr, additions: 100 + num, deletions: num, changed_files: 3 }),
         { status: 200 }
      );
   }
   return new Response(JSON.stringify(FAKE_PRS), { status: 200 });
}) as unknown as typeof fetch;

describe('reviews (GitHub ingestion)', () => {
   it('syncs PRs into review table with status/resolves parsing', async () => {
      const db = await makeTestDb();
      const n = await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      expect(n).toBe(2);

      const { items, total } = await listReviews(db);
      expect(items).toHaveLength(2);
      expect(total).toBe(2);
      const merged = items.find((r) => r.prNumber === 40)!;
      expect(merged.status).toBe('merged');
      const open = items.find((r) => r.prNumber === 42)!;
      expect(open.status).toBe('open');
      expect(open.resolves?.identifier).toBe('LNUI-701'); // parseado do título
   });

   it('fills additions/deletions from the individual PR GET (open PRs)', async () => {
      const db = await makeTestDb();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      const open = await getReview(db, 'x/y#42');
      expect(open?.additions).toBe(142); // 100 + number, vindo do GET individual
      expect(open?.deletions).toBe(42);
      // PR merged não tem detalhe buscado (cap de rate-limit) → fica em 0.
      const merged = await getReview(db, 'x/y#40');
      expect(merged?.additions).toBe(0);
   });

   it('is idempotent (re-sync upserts, no dup)', async () => {
      const db = await makeTestDb();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      expect((await listReviews(db)).total).toBe(2);
   });

   it('syncs many repos in parallel batches (> concorrência)', async () => {
      const db = await makeTestDb();
      const repos = Array.from({ length: 20 }, (_, i) => `org/repo-${i}`);
      const n = await syncFromGitHub(db, { repos, token: 'fake', fetchImpl: fakeFetch });
      expect(n).toBe(40); // 20 repos × 2 PRs
      expect((await listReviews(db)).total).toBe(40);
   });

   it('paginates with limit/offset and reports the full total', async () => {
      const db = await makeTestDb();
      const repos = Array.from({ length: 20 }, (_, i) => `org/repo-${i}`);
      await syncFromGitHub(db, { repos, token: 'fake', fetchImpl: fakeFetch });

      const first = await listReviews(db, { limit: 10, offset: 0 });
      expect(first.items).toHaveLength(10);
      expect(first.total).toBe(40); // total do conjunto, não da página

      const second = await listReviews(db, { limit: 10, offset: 10 });
      expect(second.items).toHaveLength(10);
      const firstIds = new Set(first.items.map((r) => r.id));
      expect(second.items.every((r) => !firstIds.has(r.id))).toBe(true); // sem overlap
   });

   it('gets a review by id and filters by status', async () => {
      const db = await makeTestDb();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      expect((await getReview(db, 'x/y#42'))?.title).toContain('combobox');
      expect((await listReviews(db, { status: 'merged' })).total).toBe(1);
   });
});
