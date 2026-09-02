import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { reviewFile, reviewCommit } from '@/db/schema';
import {
   syncFromGitHub,
   getReview,
   handlePullRequestEvent,
   handleCheckRunEvent,
} from '@/lib/api/reviews';

const OPEN_PR = {
   number: 7,
   title: 'Add files ingestion',
   state: 'open',
   merged_at: null,
   html_url: 'https://github.com/x/y/pull/7',
   created_at: '2026-09-01T00:00:00Z',
   user: { login: 'ana' },
   base: { ref: 'main' },
   head: { ref: 'feat/files', sha: 'abc123abc123abc123abc123abc123abc123abc1' },
};
const MERGED_PR = {
   ...OPEN_PR,
   number: 5,
   title: 'Old merged',
   state: 'closed',
   merged_at: '2026-08-01T00:00:00Z',
   head: { ref: 'old', sha: 'ffff' },
};

const PATCH = '@@ -1,2 +1,3 @@\n line1\n+added\n line2';

/** Fake fetch ciente das rotas do GitHub usadas pelo sync. `opts` liga falhas. */
function makeFetch(opts: { filesFail?: boolean; files?: unknown[]; checks?: unknown } = {}) {
   const calls: string[] = [];
   const f = (async (url: string) => {
      const u = String(url);
      calls.push(u);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (/\/pulls\/\d+\/files/.test(u)) {
         if (opts.filesFail) return json({ message: 'boom' }, 500);
         return json(
            opts.files ?? [
               {
                  filename: 'src/app.ts',
                  status: 'modified',
                  additions: 1,
                  deletions: 0,
                  patch: PATCH,
               },
               {
                  filename: 'test/app.test.ts',
                  status: 'added',
                  additions: 9,
                  deletions: 0,
                  patch: PATCH,
               },
               { filename: 'assets/logo.png', status: 'added', additions: 0, deletions: 0 },
            ]
         );
      }
      if (/\/pulls\/\d+\/commits/.test(u)) {
         return json([
            {
               sha: '1111111111111111111111111111111111111111',
               commit: {
                  message: 'feat: first\n\nbody',
                  author: { name: 'Ana', date: '2026-09-01T10:00:00Z' },
               },
               author: { login: 'ana' },
            },
            {
               sha: '2222222222222222222222222222222222222222',
               commit: {
                  message: 'test: second',
                  author: { name: 'Ana', date: '2026-09-01T11:00:00Z' },
               },
               author: null,
            },
         ]);
      }
      if (/\/commits\/[0-9a-f]+\/check-runs/.test(u)) {
         return json(
            opts.checks ?? {
               total_count: 3,
               check_runs: [
                  { conclusion: 'success' },
                  { conclusion: 'skipped' },
                  { conclusion: 'failure' },
               ],
            }
         );
      }
      if (/\/pulls\/\d+(?:$|\?)/.test(u)) {
         const num = Number(u.match(/\/pulls\/(\d+)/)![1]);
         const pr = [OPEN_PR, MERGED_PR].find((p) => p.number === num);
         return json({ ...pr, additions: 10, deletions: 1, changed_files: 3 });
      }
      return json([OPEN_PR, MERGED_PR]);
   }) as unknown as typeof fetch;
   return { fetch: f, calls };
}

describe('reviews: arquivos, commits e checks', () => {
   it('persiste arquivos, commits e checks do PR aberto no sync', async () => {
      const db = await makeTestDb();
      const { fetch } = makeFetch();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fetch });

      const detail = await getReview(db, 'x/y#7');
      expect(detail?.checksPassed).toBe(2); // success + skipped
      expect(detail?.checksTotal).toBe(3);
      expect(detail?.files.map((f) => f.path)).toEqual([
         'assets/logo.png',
         'src/app.ts',
         'test/app.test.ts',
      ]);
      const app = detail!.files.find((f) => f.path === 'src/app.ts')!;
      expect(app).toMatchObject({ status: 'modified', additions: 1, deletions: 0, patch: PATCH });
      expect(detail!.files.find((f) => f.path === 'assets/logo.png')!.patch).toBeNull();
      expect(detail?.commits).toHaveLength(2);
      expect(detail?.commits[0]).toMatchObject({
         sha: '1111111111111111111111111111111111111111',
         message: 'feat: first\n\nbody',
         author: 'ana',
      });
      expect(detail?.commits[1].author).toBeNull();
      expect(detail?.commits[1].committedAt).toBe('2026-09-01T11:00:00.000Z');
   });

   it('não busca detalhe de PR mergeado (cap de rate-limit)', async () => {
      const db = await makeTestDb();
      const { fetch, calls } = makeFetch();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: fetch });
      expect(calls.some((u) => /\/pulls\/5\/files/.test(u))).toBe(false);
      const merged = await getReview(db, 'x/y#5');
      expect(merged?.files).toEqual([]);
      expect(merged?.checksTotal).toBe(0);
   });

   it('re-sync substitui os arquivos (sem duplicar nem deixar órfão)', async () => {
      const db = await makeTestDb();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: makeFetch().fetch });
      const second = makeFetch({
         files: [
            { filename: 'src/only.ts', status: 'added', additions: 2, deletions: 0, patch: PATCH },
         ],
      });
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: second.fetch });
      const rows = await db.select().from(reviewFile).where(eq(reviewFile.reviewId, 'x/y#7'));
      expect(rows.map((r) => r.path)).toEqual(['src/only.ts']);
   });

   it('falha em /files não derruba o PR nem os commits/checks', async () => {
      const db = await makeTestDb();
      await syncFromGitHub(db, {
         repos: ['x/y'],
         token: 'fake',
         fetchImpl: makeFetch({ filesFail: true }).fetch,
      });
      const detail = await getReview(db, 'x/y#7');
      expect(detail).not.toBeNull();
      expect(detail?.files).toEqual([]);
      expect(detail?.commits).toHaveLength(2);
      expect(detail?.checksTotal).toBe(3);
   });

   it('webhook pull_request busca o detalhe quando há token', async () => {
      const db = await makeTestDb();
      const { fetch } = makeFetch();
      await handlePullRequestEvent(
         db,
         {
            repository: { full_name: 'x/y' },
            pull_request: { ...OPEN_PR, additions: 10, deletions: 1 },
         },
         { token: 'fake', fetchImpl: fetch }
      );
      const detail = await getReview(db, 'x/y#7');
      expect(detail?.files).toHaveLength(3);
      expect(detail?.checksPassed).toBe(2);
   });

   it('webhook check_run recalcula os checks do PR', async () => {
      const db = await makeTestDb();
      await syncFromGitHub(db, { repos: ['x/y'], token: 'fake', fetchImpl: makeFetch().fetch });
      const green = makeFetch({
         checks: {
            total_count: 3,
            check_runs: [
               { conclusion: 'success' },
               { conclusion: 'success' },
               { conclusion: 'success' },
            ],
         },
      });
      const { updated } = await handleCheckRunEvent(
         db,
         {
            repository: { full_name: 'x/y' },
            check_run: {
               head_sha: OPEN_PR.head.sha,
               pull_requests: [{ number: 7 }, { number: 999 }],
            },
         },
         { token: 'fake', fetchImpl: green.fetch }
      );
      expect(updated).toEqual(['x/y#7']);
      const detail = await getReview(db, 'x/y#7');
      expect(detail?.checksPassed).toBe(3);
      const commits = await db
         .select()
         .from(reviewCommit)
         .where(eq(reviewCommit.reviewId, 'x/y#7'));
      expect(commits).toHaveLength(2); // intocado
   });
});
