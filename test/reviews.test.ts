import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { issue, issuePrLink } from '@/db/schema';
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

   it('auto-linka PR↔issue (issue_pr_link) quando o título resolve um identifier real', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'LNUI');
      await db.insert(issue).values({
         id: 'iss-701',
         identifier: 'LNUI-701', // casa com o título do PR 42
         teamId: 'LNUI',
         title: 'Combobox perde foco',
         statusId: 'to-do',
         priorityId: 'low',
         rank: 'a',
      });

      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      const links = await db.select().from(issuePrLink).where(eq(issuePrLink.issueId, 'iss-701'));
      expect(links).toHaveLength(1);
      expect(links[0].title).toContain('combobox');
      expect(links[0].status).toBe('open');

      // resolvesTitle passa a ser o título da ISSUE (era o do PR, enganoso)
      const rv = await getReview(db, 'x/y#42');
      expect(rv?.resolves?.title).toBe('Combobox perde foco');

      // re-sync não duplica (id md5 determinístico)
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      const after = await db.select().from(issuePrLink).where(eq(issuePrLink.issueId, 'iss-701'));
      expect(after).toHaveLength(1);
   });

   it('PR mergeado move a issue pra Done + reconhece identifier no branch', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'ENG');
      await db.insert(issue).values({
         id: 'iss-eng-1',
         identifier: 'ENG-1',
         teamId: 'ENG',
         title: 'Corrige X',
         statusId: 'in-progress', // aberta (started)
         priorityId: 'low',
         rank: 'a',
      });
      // PR mergeado sem id no título, mas com id no NOME DO BRANCH (eng-1-...)
      const prs = [
         {
            number: 7,
            title: 'Fix the thing',
            state: 'closed',
            merged_at: '2026-07-01T00:00:00Z',
            html_url: 'https://github.com/o/r/pull/7',
            created_at: '2026-06-30T00:00:00Z',
            user: { login: 'ana' },
            base: { ref: 'main' },
            head: { ref: 'eng-1-fix-the-thing' },
         },
      ];
      const fetchImpl = (async (url: string) => {
         if (/\/pulls\/\d+/.test(String(url)))
            return new Response(JSON.stringify(prs[0]), { status: 200 });
         return new Response(JSON.stringify(prs), { status: 200 });
      }) as unknown as typeof fetch;

      await syncFromGitHub(db, { repos: ['o/r'], token: 'x', fetchImpl });

      const [iss] = await db.select().from(issue).where(eq(issue.id, 'iss-eng-1'));
      // 'done' é o completed de menor position no catálogo (2 < shipped 10) → alvo do transition.
      expect(iss.statusId).toBe('done');
      const links = await db.select().from(issuePrLink).where(eq(issuePrLink.issueId, 'iss-eng-1'));
      expect(links).toHaveLength(1); // auto-link por branch
   });

   it('não cria link quando o identifier não corresponde a issue nenhuma', async () => {
      const db = await makeTestDb();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      expect(await db.select().from(issuePrLink)).toHaveLength(0);
   });

   it('gets a review by id and filters by status', async () => {
      const db = await makeTestDb();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fakeFetch });
      expect((await getReview(db, 'x/y#42'))?.title).toContain('combobox');
      expect((await listReviews(db, { status: 'merged' })).total).toBe(1);
   });
});
