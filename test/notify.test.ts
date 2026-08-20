import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue, updateIssue } from '@/lib/api/issues';
import { addComment } from '@/lib/api/issue-detail';
import { listInbox } from '@/lib/api/notifications';

const ACTOR = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const bob = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
   return { db, bob };
}

describe('notification dispatch', () => {
   it('assigning an issue notifies the new assignee', async () => {
      const { db, bob } = await setup();
      const issue = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         ACTOR
      );
      await updateIssue(db, issue.id, { assigneeId: bob }, ACTOR);

      const inbox = await listInbox(db, bob);
      expect(inbox).toHaveLength(1);
      expect(inbox[0].type).toBe('assignment');
      expect(inbox[0].issue?.identifier).toBe(issue.identifier);
   });

   it('commenting notifies the issue assignee (not the commenter)', async () => {
      const { db, bob } = await setup();
      const issue = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low', assigneeId: bob },
         ACTOR
      );
      // ana comenta -> bob (assignee) é notificado
      await addComment(db, issue.id, 'oi', ACTOR);
      const inbox = await listInbox(db, bob);
      expect(inbox.some((n) => n.type === 'comment')).toBe(true);
   });

   it('does not notify when assignee is the actor themselves', async () => {
      const { db } = await setup();
      const ana = await seedUser(db, { name: 'Ana', email: ACTOR });
      const issue = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         ACTOR
      );
      await updateIssue(db, issue.id, { assigneeId: ana }, ACTOR); // ana se auto-atribui
      expect(await listInbox(db, ana)).toHaveLength(0);
   });
});
