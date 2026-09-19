import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import type { Db } from '@/db';
import { issue, issuePrLink, review } from '@/db/schema';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { handlePullRequestEvent, syncFromGitHub } from '@/lib/api/reviews';

/**
 * #9 / Co#18 / Co#19 — o sync/webhook do GitHub não pode refechar uma issue reaberta
 * (automação `pr.merged` só na TRANSIÇÃO para merged), não publica `issue` quando o link
 * não mudou, identifica o link por (issue, repo, PR) — renomear o PR não duplica — e
 * ignora evento fora de ordem (`updated_at` mais antigo que o gravado).
 */
const BASE_PR = {
   number: 42,
   title: 'ENG-1 fix the thing',
   state: 'open',
   merged_at: null as string | null,
   html_url: 'https://github.com/nimbloo/circle/pull/42',
   created_at: '2026-08-01T00:00:00Z',
   updated_at: '2026-08-01T00:00:00Z',
   user: { login: 'ana' },
   base: { ref: 'main' },
   head: { ref: 'ana/eng-1-fix' },
   additions: 1,
   deletions: 1,
};

function ev(over: Partial<typeof BASE_PR> = {}) {
   return { repository: { full_name: 'nimbloo/circle' }, pull_request: { ...BASE_PR, ...over } };
}

const MERGED = {
   state: 'closed',
   merged_at: '2026-08-02T00:00:00Z',
   updated_at: '2026-08-02T00:00:00Z',
};

let db: Db;
let events: CircleEvent[];
let stop: () => void;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'ENG');
   await db.insert(issue).values({
      id: 'iss-eng-1',
      identifier: 'ENG-1',
      teamId: 'ENG',
      title: 'Corrige X',
      statusId: 'in-progress',
      priorityId: 'low',
      rank: 'a',
   });
   events = [];
   stop = subscribe((e) => events.push(e));
});
afterEach(() => stop());

async function statusOfIssue() {
   const [row] = await db.select().from(issue).where(eq(issue.id, 'iss-eng-1'));
   return row.statusId;
}

describe('pr.merged só na transição (#9)', () => {
   it('webhook re-entregue não refecha a issue reaberta', async () => {
      await handlePullRequestEvent(db, ev(MERGED));
      expect(await statusOfIssue()).toBe('done');
      // Alguém reabre a issue.
      await db.update(issue).set({ statusId: 'in-progress' }).where(eq(issue.id, 'iss-eng-1'));
      // GitHub re-entrega (ou chega um `edited` do PR já mergeado).
      await handlePullRequestEvent(db, ev({ ...MERGED, updated_at: '2026-08-03T00:00:00Z' }));
      expect(await statusOfIssue()).toBe('in-progress');
   });

   it('sync por polling não refecha a issue reaberta', async () => {
      const merged = { ...BASE_PR, ...MERGED };
      const fetchImpl = (async (url: string) =>
         new Response(JSON.stringify(/\/pulls\/\d+/.test(String(url)) ? merged : [merged]), {
            status: 200,
         })) as unknown as typeof fetch;
      await syncFromGitHub(db, { repos: ['nimbloo/circle'], token: 't', fetchImpl });
      expect(await statusOfIssue()).toBe('done');
      await db.update(issue).set({ statusId: 'in-progress' }).where(eq(issue.id, 'iss-eng-1'));
      await syncFromGitHub(db, { repos: ['nimbloo/circle'], token: 't', fetchImpl });
      expect(await statusOfIssue()).toBe('in-progress');
   });

   it('PR aberto e depois mergeado dispara a automação', async () => {
      await handlePullRequestEvent(db, ev());
      expect(await statusOfIssue()).toBe('in-progress');
      await handlePullRequestEvent(db, ev(MERGED));
      expect(await statusOfIssue()).toBe('done');
   });
});

describe('publish de issue só quando o link muda (#9)', () => {
   it('re-sync sem mudança não publica issue', async () => {
      await handlePullRequestEvent(db, ev());
      expect(events.some((e) => e.entity === 'issue' && e.id === 'iss-eng-1')).toBe(true);
      events = [];
      await handlePullRequestEvent(db, ev({ updated_at: '2026-08-01T01:00:00Z' }));
      expect(events.some((e) => e.entity === 'issue')).toBe(false);
   });

   it('mudança de status do PR publica a issue', async () => {
      await handlePullRequestEvent(db, ev());
      await db.update(issue).set({ statusId: 'canceled' }).where(eq(issue.id, 'iss-eng-1'));
      events = [];
      await handlePullRequestEvent(db, ev(MERGED));
      expect(events.some((e) => e.entity === 'issue' && e.id === 'iss-eng-1')).toBe(true);
   });
});

describe('link por (issue, repo, PR) (Co#18)', () => {
   it('renomear o PR atualiza o link em vez de duplicar', async () => {
      await handlePullRequestEvent(db, ev());
      await handlePullRequestEvent(
         db,
         ev({ title: 'ENG-1 novo título', updated_at: '2026-08-01T02:00:00Z' })
      );
      const links = await db.select().from(issuePrLink).where(eq(issuePrLink.issueId, 'iss-eng-1'));
      expect(links).toHaveLength(1);
      expect(links[0].title).toBe('ENG-1 novo título');
   });

   it('dois PRs do mesmo repo resolvendo a mesma issue geram dois links', async () => {
      await handlePullRequestEvent(db, ev());
      await handlePullRequestEvent(db, ev({ number: 43, title: 'ENG-1 parte 2' }));
      const links = await db.select().from(issuePrLink).where(eq(issuePrLink.issueId, 'iss-eng-1'));
      expect(links).toHaveLength(2);
   });
});

describe('webhook fora de ordem e resposta rápida (Co#19)', () => {
   it('evento mais antigo que o gravado é ignorado', async () => {
      await handlePullRequestEvent(db, ev(MERGED));
      // Entrega atrasada do `opened` (updated_at anterior).
      const res = await handlePullRequestEvent(db, ev());
      expect(res.stale).toBe(true);
      const [rv] = await db.select().from(review).where(eq(review.id, 'nimbloo/circle#42'));
      expect(rv.status).toBe('merged');
      const [link] = await db
         .select()
         .from(issuePrLink)
         .where(eq(issuePrLink.issueId, 'iss-eng-1'));
      expect(link.status).toBe('merged');
   });

   it('com `defer`, a profundidade do PR roda depois do retorno', async () => {
      const calls: string[] = [];
      const fetchImpl = (async (url: string) => {
         calls.push(String(url));
         return new Response(JSON.stringify([]), { status: 200 });
      }) as unknown as typeof fetch;
      const deferred: (() => Promise<void>)[] = [];
      await handlePullRequestEvent(db, ev(), {
         token: 't',
         fetchImpl,
         defer: (task) => deferred.push(task),
      });
      expect(calls).toHaveLength(0);
      expect(events.some((e) => e.entity === 'review')).toBe(true);
      expect(deferred).toHaveLength(1);
      events = [];
      await deferred[0]();
      expect(calls.length).toBeGreaterThan(0);
      expect(events.some((e) => e.entity === 'review')).toBe(true);
   });
});
