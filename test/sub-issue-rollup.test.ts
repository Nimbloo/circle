import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { issue, issueRelation } from '@/db/schema';
import { listIssues } from '@/lib/api/issues';

async function seedIssue(db: Awaited<ReturnType<typeof makeTestDb>>, id: string, statusId: string) {
   await db.insert(issue).values({
      id,
      identifier: `CORE-${id}`,
      teamId: 'CORE',
      title: id,
      statusId,
      priorityId: 'low',
      rank: id,
   });
}

describe('sub-issue rollup no DTO da lista (#25)', () => {
   it('conta filhas (kind=sub) e quantas estão concluídas', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await seedIssue(db, 'parent', 'in-progress');
      await seedIssue(db, 'c1', 'done'); // completed
      await seedIssue(db, 'c2', 'done'); // completed
      await seedIssue(db, 'c3', 'in-progress'); // não concluída
      for (const childId of ['c1', 'c2', 'c3']) {
         await db
            .insert(issueRelation)
            .values({ id: randomUUID(), issueId: 'parent', relatedId: childId, kind: 'sub' });
      }

      const list = await listIssues(db, { team: 'CORE' });
      const parent = list.find((i) => i.id === 'parent')!;
      expect(parent.subIssueCount).toBe(3);
      expect(parent.subIssueDoneCount).toBe(2);

      // issue sem filhas → 0/0
      const c1 = list.find((i) => i.id === 'c1')!;
      expect(c1.subIssueCount).toBe(0);
      expect(c1.subIssueDoneCount).toBe(0);
   });

   it('relações related/blocked_by não entram no rollup', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await seedIssue(db, 'parent', 'in-progress');
      await seedIssue(db, 'other', 'done');
      await db
         .insert(issueRelation)
         .values({ id: randomUUID(), issueId: 'parent', relatedId: 'other', kind: 'related' });

      const list = await listIssues(db, { team: 'CORE' });
      const parent = list.find((i) => i.id === 'parent')!;
      expect(parent.subIssueCount).toBe(0);
   });
});
