import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { issue, issuePrLink, review } from '@/db/schema';
import { handlePullRequestEvent } from '@/lib/api/reviews';
import { verifySignature, signatureFrom } from '@/lib/api/integrations/github';

function prEvent(over: Record<string, unknown> = {}) {
   return {
      repository: { full_name: 'nimbloo/circle' },
      pull_request: {
         number: 42,
         title: 'ENG-1 fix the thing',
         state: 'open',
         merged_at: null,
         html_url: 'https://github.com/nimbloo/circle/pull/42',
         created_at: '2026-08-01T00:00:00Z',
         user: { login: 'ana' },
         base: { ref: 'main' },
         head: { ref: 'ana/eng-1-fix' },
         additions: 12,
         deletions: 3,
         ...over,
      },
   };
}

async function seedIssue(db: Awaited<ReturnType<typeof makeTestDb>>, statusId = 'in-progress') {
   await seedTeam(db, 'ENG');
   await db.insert(issue).values({
      id: 'iss-eng-1',
      identifier: 'ENG-1',
      teamId: 'ENG',
      title: 'Corrige X',
      statusId,
      priorityId: 'low',
      rank: 'a',
   });
}

describe('github webhook: handlePullRequestEvent', () => {
   it('upserts a review and links the PR to the referenced issue', async () => {
      const db = await makeTestDb();
      await seedIssue(db);

      const res = await handlePullRequestEvent(db, prEvent());
      expect(res.linked).toBe('ENG-1');

      const [rev] = await db.select().from(review).where(eq(review.id, 'nimbloo/circle#42'));
      expect(rev.status).toBe('open');
      expect(rev.additions).toBe(12);
      expect(rev.resolvesIdentifier).toBe('ENG-1');

      const links = await db.select().from(issuePrLink).where(eq(issuePrLink.issueId, 'iss-eng-1'));
      expect(links).toHaveLength(1);
   });

   it('moves the issue to Done when the PR is merged', async () => {
      const db = await makeTestDb();
      await seedIssue(db);

      await handlePullRequestEvent(
         db,
         prEvent({ state: 'closed', merged_at: '2026-08-02T00:00:00Z' })
      );

      const [iss] = await db.select().from(issue).where(eq(issue.id, 'iss-eng-1'));
      expect(iss.statusId).toBe('done');
   });

   it('is idempotent on re-delivery of the same payload (upsert, no duplicate)', async () => {
      const db = await makeTestDb();
      await seedIssue(db);
      await handlePullRequestEvent(db, prEvent());
      // GitHub re-entrega o MESMO payload → upsert, sem duplicar review nem link.
      await handlePullRequestEvent(db, prEvent());

      expect(await db.select().from(review)).toHaveLength(1);
      const links = await db.select().from(issuePrLink).where(eq(issuePrLink.issueId, 'iss-eng-1'));
      expect(links).toHaveLength(1);
   });

   it('ignores a payload without a matching issue (no link, review still upserted)', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'ENG');
      const res = await handlePullRequestEvent(
         db,
         prEvent({ title: 'no ref here', head: { ref: 'x' } })
      );
      expect(res.linked).toBeNull();
      expect(await db.select().from(review)).toHaveLength(1);
      expect(await db.select().from(issuePrLink)).toHaveLength(0);
   });

   it('returns linked:null on a malformed payload', async () => {
      const db = await makeTestDb();
      expect((await handlePullRequestEvent(db, {})).linked).toBeNull();
   });
});

describe('github webhook: signature', () => {
   const SECRET = 'top-secret';
   beforeEach(() => {
      process.env.CIRCLE_GITHUB_WEBHOOK_SECRET = SECRET;
   });
   afterEach(() => {
      delete process.env.CIRCLE_GITHUB_WEBHOOK_SECRET;
   });

   const sign = (body: string) =>
      'sha256=' + createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

   it('accepts a correct signature', () => {
      const body = JSON.stringify({ a: 1 });
      expect(verifySignature(body, sign(body))).toBe(true);
   });

   it('rejects a wrong signature', () => {
      expect(verifySignature('{"a":1}', 'sha256=deadbeef')).toBe(false);
   });

   it('rejects when the secret is unset', () => {
      delete process.env.CIRCLE_GITHUB_WEBHOOK_SECRET;
      const body = '{"a":1}';
      expect(verifySignature(body, sign(body))).toBe(false);
   });

   it('reads the signature from the X-Hub-Signature-256 header', () => {
      const h = new Headers({ 'x-hub-signature-256': 'sha256=abc' });
      expect(signatureFrom(h)).toBe('sha256=abc');
   });
});
