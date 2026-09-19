import { describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue } from '@/db/schema';
import { createIssue, getIssue, reorderIssue, updateIssue } from '@/lib/api/issues';

const ACTOR = 'rank-owner@nimbloo.ai';
const RANK_LIMIT = 32;

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Rank Owner', email: ACTOR, teamIds: ['CORE'] });
   return db;
}

describe('rebalanceamento de ranks por time', () => {
   it('mantém 3.000 creates e 100 moves-to-top dentro do limite', async () => {
      const db = await setup();
      const ids: string[] = [];

      for (let i = 0; i < 3000; i++) {
         const created = await createIssue(
            db,
            { teamId: 'CORE', title: `Issue ${i}`, statusId: 'to-do', priorityId: 'low' },
            ACTOR,
            { silent: true }
         );
         ids.push(created.id);
      }

      for (let i = 0; i < 100; i++) {
         await reorderIssue(db, ids[ids.length - 1], null, ids[0], ACTOR);
      }

      const rows = await db
         .select({ id: issue.id, rank: issue.rank })
         .from(issue)
         .where(eq(issue.teamId, 'CORE'))
         .orderBy(asc(issue.rank));
      expect(rows).toHaveLength(3000);
      expect(Math.max(...rows.map((row) => row.rank.length))).toBeLessThanOrEqual(RANK_LIMIT);
      expect(new Set(rows.map((row) => row.rank)).size).toBe(rows.length);
   }, 120_000);

   it('serializa updates concorrentes e calcula o diff com o estado bloqueado', async () => {
      const db = await setup();
      const alice = await seedUser(db, {
         name: 'Alice',
         email: 'alice@nimbloo.ai',
         teamIds: ['CORE'],
      });
      const bob = await seedUser(db, {
         name: 'Bob',
         email: 'bob@nimbloo.ai',
         teamIds: ['CORE'],
      });
      const created = await createIssue(
         db,
         { teamId: 'CORE', title: 'Concurrent', statusId: 'to-do', priorityId: 'low' },
         ACTOR,
         { silent: true }
      );

      await Promise.all([
         updateIssue(db, created.id, { assigneeIds: [alice] }, ACTOR, { silent: true }),
         updateIssue(db, created.id, { assigneeIds: [bob] }, ACTOR, { silent: true }),
      ]);

      const current = await getIssue(db, created.id);
      expect(current?.assignees).toHaveLength(1);
      expect([alice, bob]).toContain(current?.assignees[0]?.id);
   });
});
