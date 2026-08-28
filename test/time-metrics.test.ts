import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue as issueT } from '@/db/schema';
import { createIssue, updateIssue } from '@/lib/api/issues';
import { timeMetrics } from '@/lib/api/aggregations';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
   return { db, user: 'ana@nimbloo.ai' };
}

const raw = async (db: Awaited<ReturnType<typeof makeTestDb>>, id: string) =>
   (await db.select().from(issueT).where(eq(issueT.id, id)).limit(1))[0];

describe('issue time markers', () => {
   it('sets startedAt on entering started and completedAt on completed', async () => {
      const { db, user } = await setup();
      const iss = await createIssue(
         db,
         { teamId: 'CORE', statusId: 'to-do', priorityId: 'high', title: 'A' },
         user
      );
      expect((await raw(db, iss.id)).startedAt).toBeNull();

      await updateIssue(db, iss.id, { statusId: 'in-progress' }, user);
      const started = await raw(db, iss.id);
      expect(started.startedAt).not.toBeNull();
      expect(started.completedAt).toBeNull();

      await updateIssue(db, iss.id, { statusId: 'done' }, user);
      const done = await raw(db, iss.id);
      expect(done.completedAt).not.toBeNull();
   });

   it('keeps startedAt sticky and clears completedAt on reopen', async () => {
      const { db, user } = await setup();
      const iss = await createIssue(
         db,
         { teamId: 'CORE', statusId: 'in-progress', priorityId: 'high', title: 'B' },
         user
      );
      const firstStart = (await raw(db, iss.id)).startedAt;
      await updateIssue(db, iss.id, { statusId: 'done' }, user);
      // reabre
      await updateIssue(db, iss.id, { statusId: 'in-progress' }, user);
      const reopened = await raw(db, iss.id);
      expect(reopened.completedAt).toBeNull();
      expect(reopened.startedAt?.getTime()).toBe(firstStart?.getTime()); // sticky
   });

   it('created directly as done gets both markers', async () => {
      const { db, user } = await setup();
      const iss = await createIssue(
         db,
         { teamId: 'CORE', statusId: 'done', priorityId: 'high', title: 'C' },
         user
      );
      const r = await raw(db, iss.id);
      expect(r.startedAt).not.toBeNull();
      expect(r.completedAt).not.toBeNull();
   });

   it('computes lead/cycle time and throughput from seeded timestamps', async () => {
      const { db, user } = await setup();
      const now = new Date('2026-08-20T00:00:00Z');
      // 2 issues concluídas com durações conhecidas.
      const a = await createIssue(
         db,
         { teamId: 'CORE', statusId: 'to-do', priorityId: 'high', title: 'D1' },
         user
      );
      const b = await createIssue(
         db,
         { teamId: 'CORE', statusId: 'to-do', priorityId: 'high', title: 'D2' },
         user
      );
      // A: created 10d antes, started 8d antes, completed 6d antes → lead 4d, cycle 2d
      await db
         .update(issueT)
         .set({
            createdAt: new Date(now.getTime() - 10 * 86400000),
            startedAt: new Date(now.getTime() - 8 * 86400000),
            completedAt: new Date(now.getTime() - 6 * 86400000),
            statusId: 'done',
         })
         .where(eq(issueT.id, a.id));
      // B: created 6d antes, started 5d antes, completed 2d antes → lead 4d, cycle 3d
      await db
         .update(issueT)
         .set({
            createdAt: new Date(now.getTime() - 6 * 86400000),
            startedAt: new Date(now.getTime() - 5 * 86400000),
            completedAt: new Date(now.getTime() - 2 * 86400000),
            statusId: 'done',
         })
         .where(eq(issueT.id, b.id));

      const m = await timeMetrics(db, { weeks: 2, now });
      expect(m.sample).toBe(2);
      expect(m.leadTime.avg).toBe(4); // (4+4)/2
      expect(m.cycleTime.avg).toBe(2.5); // (2+3)/2
      // throughput: ambas concluídas na última semana (≤7d antes de now)
      const total = m.throughput.reduce((s, w) => s + w.completed, 0);
      expect(total).toBe(2);
      expect(m.throughput).toHaveLength(2);
   });
});
