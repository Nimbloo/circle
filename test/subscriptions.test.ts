import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue, updateIssue } from '@/lib/api/issues';
import { addComment, getIssueDetail } from '@/lib/api/issue-detail';
import {
   subscribeUsers,
   unsubscribeUser,
   listSubscriberIds,
} from '@/lib/api/subscriptions';
import { listInbox } from '@/lib/api/notifications';

const ANA = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const ana = await seedUser(db, { name: 'Ana', email: ANA });
   const bob = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
   const carol = await seedUser(db, { name: 'Carol', email: 'carol@nimbloo.ai' });
   return { db, ana, bob, carol };
}

const mk = (db: Awaited<ReturnType<typeof setup>>['db'], assigneeId?: string) =>
   createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low', assigneeId },
      ANA
   );

describe('issue subscriptions', () => {
   it('auto-subscribes the creator on create', async () => {
      const { db, ana } = await setup();
      const issue = await mk(db);
      expect(await listSubscriberIds(db, issue.id)).toContain(ana);
      expect((await getIssueDetail(db, issue.id, ana))?.subscribed).toBe(true);
   });

   it('auto-subscribes the new assignee on assign', async () => {
      const { db, bob } = await setup();
      const issue = await mk(db);
      await updateIssue(db, issue.id, { assigneeId: bob }, ANA);
      expect(await listSubscriberIds(db, issue.id)).toContain(bob);
   });

   it('auto-subscribes the commenter', async () => {
      const { db, carol } = await setup();
      const issue = await mk(db);
      await addComment(db, issue.id, 'olha isso', 'carol@nimbloo.ai');
      expect(await listSubscriberIds(db, issue.id)).toContain(carol);
   });

   it('subscribe/unsubscribe toggle is idempotent', async () => {
      const { db, bob } = await setup();
      const issue = await mk(db);
      await subscribeUsers(db, issue.id, [bob]);
      await subscribeUsers(db, issue.id, [bob]); // idempotente (não duplica)
      expect((await listSubscriberIds(db, issue.id)).filter((id) => id === bob)).toHaveLength(1);
      await unsubscribeUser(db, issue.id, bob);
      expect(await listSubscriberIds(db, issue.id)).not.toContain(bob);
   });

   it('notifies followers (not the actor) on a new comment', async () => {
      const { db, ana, bob, carol } = await setup();
      const issue = await mk(db); // ana é criadora (follower)
      await subscribeUsers(db, issue.id, [bob]); // bob segue manualmente
      // carol comenta -> ana e bob (followers) recebem in-app; carol (ator) não.
      await addComment(db, issue.id, 'comentário', 'carol@nimbloo.ai');
      expect((await listInbox(db, ana)).some((n) => n.type === 'comment')).toBe(true);
      expect((await listInbox(db, bob)).some((n) => n.type === 'comment')).toBe(true);
      expect(await listInbox(db, carol)).toHaveLength(0);
   });

   it('notifies followers on a significant field change (status)', async () => {
      const { db, bob } = await setup();
      const issue = await mk(db);
      await subscribeUsers(db, issue.id, [bob]);
      // ana muda o status -> bob (follower) recebe 'update'; ana (ator) não.
      await updateIssue(db, issue.id, { statusId: 'in-progress' }, ANA);
      expect((await listInbox(db, bob)).some((n) => n.type === 'update')).toBe(true);
   });

   it('subscribed is false for a non-subscriber and when the viewer is unknown', async () => {
      const { db, carol } = await setup();
      const issue = await mk(db);
      expect((await getIssueDetail(db, issue.id, carol))?.subscribed).toBe(false);
      expect((await getIssueDetail(db, issue.id))?.subscribed).toBe(false);
   });
});
