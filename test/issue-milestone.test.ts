import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue as issueT } from '@/db/schema';
import { createIssue, updateIssue, getIssue } from '@/lib/api/issues';
import { getIssueDetail } from '@/lib/api/issue-detail';
import { createProject } from '@/lib/api/projects';
import { addMilestone, listMilestones, deleteMilestone } from '@/lib/api/project-detail';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
   const author = 'ana@nimbloo.ai';
   const base = { priorityId: 'high', healthId: 'on-track', teamId: 'CORE' as const };
   const project = await createProject(db, { name: 'P1', statusId: 'proj-in-progress', ...base });
   const other = await createProject(db, { name: 'P2', statusId: 'proj-in-progress', ...base });
   return { db, author, project, other };
}

const issueBase = {
   teamId: 'CORE',
   statusId: 'to-do',
   priorityId: 'high',
};

describe('issue milestone FK', () => {
   it('sets a milestone belonging to the issue project and resolves its name', async () => {
      const { db, author, project } = await setup();
      const ms = await addMilestone(db, project.id, { name: 'Alpha' });
      const iss = await createIssue(
         db,
         { ...issueBase, title: 'A', projectId: project.id },
         author
      );

      const updated = await updateIssue(db, iss.id, { milestoneId: ms.id }, author);
      expect(updated).not.toBeNull();

      const detail = await getIssueDetail(db, iss.id);
      expect(detail?.milestoneId).toBe(ms.id);
      expect(detail?.milestoneName).toBe('Alpha');
   });

   it('rejects a milestone from another project', async () => {
      const { db, author, project, other } = await setup();
      const foreign = await addMilestone(db, other.id, { name: 'Foreign' });
      const iss = await createIssue(
         db,
         { ...issueBase, title: 'B', projectId: project.id },
         author
      );

      await expect(updateIssue(db, iss.id, { milestoneId: foreign.id }, author)).rejects.toThrow();
   });

   it('clears the milestone with null', async () => {
      const { db, author, project } = await setup();
      const ms = await addMilestone(db, project.id, { name: 'Beta' });
      const iss = await createIssue(
         db,
         { ...issueBase, title: 'C', projectId: project.id },
         author
      );
      await updateIssue(db, iss.id, { milestoneId: ms.id }, author);

      await updateIssue(db, iss.id, { milestoneId: null }, author);
      const detail = await getIssueDetail(db, iss.id);
      expect(detail?.milestoneId).toBeNull();
      expect(detail?.milestoneName).toBeNull();
   });

   it('deleting a milestone nulls out referencing issues (no orphan FK)', async () => {
      const { db, author, project } = await setup();
      const ms = await addMilestone(db, project.id, { name: 'Gamma' });
      const iss = await createIssue(
         db,
         { ...issueBase, title: 'D', projectId: project.id },
         author
      );
      await updateIssue(db, iss.id, { milestoneId: ms.id }, author);

      const removed = await deleteMilestone(db, ms.id);
      expect(removed).toBe(true);

      const row = await db.select().from(issueT).where(eq(issueT.id, iss.id)).limit(1);
      expect(row[0].milestoneId).toBeNull();
      expect(await getIssue(db, iss.id)).not.toBeNull(); // issue sobrevive
   });

   it('computes milestone progress (done/total) from issue statuses', async () => {
      const { db, author, project } = await setup();
      const ms = await addMilestone(db, project.id, { name: 'Delta' });
      const done = await createIssue(
         db,
         { ...issueBase, title: 'E', projectId: project.id },
         author
      );
      const open = await createIssue(
         db,
         { ...issueBase, title: 'F', projectId: project.id },
         author
      );
      await updateIssue(db, done.id, { milestoneId: ms.id, statusId: 'done' }, author);
      await updateIssue(db, open.id, { milestoneId: ms.id }, author);

      const list = await listMilestones(db, project.id);
      const target = list.find((m) => m.id === ms.id);
      expect(target?.progress).toEqual({ done: 1, total: 2 });
   });
});
