import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import type { Db } from '@/db';
import { issue as issueT } from '@/db/schema';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { handleCheckRunEvent, handlePullRequestEvent, listReviews } from '@/lib/api/reviews';

/**
 * Reviews em tempo real (#34): o evento sai DEPOIS de gravar checks/arquivos (senão o
 * cliente recarrega e vê o PR sem eles), `check_run` publica, e o link PR↔issue avisa a
 * issue. E a listagem não carrega o `guide` (JSON grande, sem uso na lista — #39).
 */
const PR = {
   number: 7,
   title: 'CORE-1 corrige login',
   state: 'open',
   merged_at: null,
   html_url: 'https://github.com/x/y/pull/7',
   created_at: '2026-09-01T00:00:00Z',
   user: { login: 'ana' },
   base: { ref: 'main' },
   head: { ref: 'feat/login', sha: 'abc123' },
};

function makeFetch() {
   const calls: string[] = [];
   const f = (async (url: string) => {
      calls.push(String(url));
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (/\/files/.test(String(url)))
         return json([{ filename: 'a.ts', status: 'modified', additions: 1, deletions: 0 }]);
      if (/check-runs/.test(String(url)))
         return json({ total_count: 1, check_runs: [{ conclusion: 'success' }] });
      if (/\/commits/.test(String(url))) return json([]);
      return json({});
   }) as unknown as typeof fetch;
   return { fetch: f, calls };
}

let db: Db;
let eventos: CircleEvent[];
let parar: () => void;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await db.insert(issueT).values({
      id: 'i1',
      identifier: 'CORE-1',
      teamId: 'CORE',
      title: 'Login',
      statusId: 'to-do',
      priorityId: 'low',
      rank: '0|a3c',
   });
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => parar());

describe('reviews publicam na hora certa (#34)', () => {
   it('pull_request publica depois de gravar checks e arquivos, e avisa a issue ligada', async () => {
      const gh = makeFetch();
      let chamadasNoPublish = -1;
      const parar2 = subscribe((e) => {
         if (e.entity === 'review') chamadasNoPublish = gh.calls.length;
      });
      await handlePullRequestEvent(
         db,
         { repository: { full_name: 'x/y' }, pull_request: PR },
         { token: 'fake', fetchImpl: gh.fetch }
      );
      parar2();
      expect(gh.calls.length).toBeGreaterThan(0);
      expect(chamadasNoPublish).toBe(gh.calls.length);
      const issueEv = eventos.find((e) => e.entity === 'issue' && e.id === 'i1');
      expect(issueEv?.teamId).toBe('CORE');
   });

   it('check_run publica o review', async () => {
      const gh = makeFetch();
      await handlePullRequestEvent(
         db,
         { repository: { full_name: 'x/y' }, pull_request: PR },
         { token: 'fake', fetchImpl: gh.fetch }
      );
      eventos = [];
      await handleCheckRunEvent(
         db,
         {
            repository: { full_name: 'x/y' },
            check_run: { head_sha: 'abc123', pull_requests: [{ number: 7 }] },
         },
         { token: 'fake', fetchImpl: gh.fetch }
      );
      expect(eventos.filter((e) => e.entity === 'review').map((e) => e.id)).toEqual(['x/y#7']);
   });
});

describe('listReviews sem guide (#39)', () => {
   it('não seleciona a coluna guide', async () => {
      await handlePullRequestEvent(db, { repository: { full_name: 'x/y' }, pull_request: PR });
      const { items } = await listReviews(db);
      expect(items).toHaveLength(1);
      // Espia as projeções pedidas ao drizzle: sem `select()` cru, sem `guide`.
      const colunas: string[] = [];
      const espiao = new Proxy(db, {
         get(target, prop, receiver) {
            const v = Reflect.get(target, prop, receiver);
            if (prop === 'select' && typeof v === 'function')
               return (fields?: Record<string, unknown>) => {
                  if (fields) colunas.push(...Object.keys(fields));
                  else colunas.push('*');
                  return v.call(target, fields);
               };
            return v;
         },
      }) as Db;
      await listReviews(espiao);
      expect(colunas).not.toContain('*');
      expect(colunas).not.toContain('guide');
      expect(colunas).toContain('title');
   });
});
