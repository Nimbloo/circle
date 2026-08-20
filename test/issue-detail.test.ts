import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { listInbox } from '@/lib/api/notifications';
import { createIssue } from '@/lib/api/issues';
import {
   getIssueDetail,
   addComment,
   listComments,
   listActivity,
   addReaction,
   removeReaction,
   addRelation,
   removeRelation,
   updateComment,
   deleteComment,
} from '@/lib/api/issue-detail';

const ME = 'dev@nimbloo.ai';

async function anIssue() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const issue = await createIssue(
      db,
      {
         teamId: 'CORE',
         title: 'X',
         statusId: 'to-do',
         priorityId: 'low',
         description: '[{"type":"paragraph","text":"olá"}]',
      },
      ME
   );
   return { db, issue };
}

describe('issue detail / comments / activity', () => {
   it('returns the rich description from issue_content', async () => {
      const { db, issue } = await anIssue();
      const detail = await getIssueDetail(db, issue.id);
      expect(detail?.description).toContain('paragraph');
      expect(detail?.subIssueIds).toEqual([]);
   });

   it('adds comments and lists them', async () => {
      const { db, issue } = await anIssue();
      await addComment(
         db,
         issue.id,
         '[{"type":"paragraph","text":"comentário"}]',
         'bob@nimbloo.ai'
      );
      const comments = await listComments(db, issue.id);
      expect(comments).toHaveLength(1);
      expect(comments[0].author?.email).toBe('bob@nimbloo.ai');
   });

   it('activity feed merges the created event and comments in order', async () => {
      const { db, issue } = await anIssue();
      await addComment(db, issue.id, 'c', 'bob@nimbloo.ai');
      const feed = await listActivity(db, issue.id);
      // pelo menos: 1 evento "created" + 1 comment
      expect(feed.some((f) => f.kind === 'event' && f.event === 'created')).toBe(true);
      expect(feed.some((f) => f.kind === 'comment')).toBe(true);
   });

   it('notifies mentioned users (@slug) in a comment', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const bob = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
      const issue = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         ME
      );
      await addComment(db, issue.id, 'oi @bob pode revisar?', ME);
      const inbox = await listInbox(db, bob);
      expect(inbox.some((n) => n.type === 'mention')).toBe(true);
   });

   it('adds and removes relations by kind (sub/related/blocked_by)', async () => {
      const { db, issue } = await anIssue();
      const other = await createIssue(
         db,
         { teamId: 'CORE', title: 'Bloqueadora', statusId: 'to-do', priorityId: 'low' },
         ME
      );

      const afterAdd = await addRelation(db, issue.id, other.id, 'blocked_by');
      expect(afterAdd?.blockedByIds).toEqual([other.id]);
      expect(afterAdd?.relatedIds).toEqual([]);

      // idempotente: adicionar de novo não duplica
      const again = await addRelation(db, issue.id, other.id, 'blocked_by');
      expect(again?.blockedByIds).toEqual([other.id]);

      const afterRemove = await removeRelation(db, issue.id, other.id, 'blocked_by');
      expect(afterRemove?.blockedByIds).toEqual([]);
   });

   it('rejects self-relation and unknown related issue', async () => {
      const { db, issue } = await anIssue();
      await expect(addRelation(db, issue.id, issue.id, 'related')).rejects.toThrow();
      await expect(addRelation(db, issue.id, 'nope', 'related')).rejects.toThrow();
   });

   it('aggregates reactions by emoji and can remove them', async () => {
      const { db, issue } = await anIssue();
      const c = await addComment(db, issue.id, 'c', ME);
      await addReaction(db, c.id, '👍', ME);
      await addReaction(db, c.id, '👍', 'bob@nimbloo.ai');
      let comments = await listComments(db, issue.id);
      expect(comments[0].reactions).toEqual([{ emoji: '👍', count: 2 }]);
      await removeReaction(db, c.id, '👍', ME);
      comments = await listComments(db, issue.id);
      expect(comments[0].reactions).toEqual([{ emoji: '👍', count: 1 }]);
   });

   it('lets the author edit their own comment', async () => {
      const { db, issue } = await anIssue();
      const c = await addComment(db, issue.id, 'antes', ME);
      const updated = await updateComment(db, c.id, 'depois', ME);
      expect(updated?.body).toBe('depois');
      const comments = await listComments(db, issue.id);
      expect(comments[0].body).toBe('depois');
   });

   it('forbids editing a comment from another author (403)', async () => {
      const { db, issue } = await anIssue();
      const c = await addComment(db, issue.id, 'meu', ME);
      await expect(updateComment(db, c.id, 'hack', 'bob@nimbloo.ai')).rejects.toThrow();
      const comments = await listComments(db, issue.id);
      expect(comments[0].body).toBe('meu');
   });

   it('lets the author delete their own comment', async () => {
      const { db, issue } = await anIssue();
      const c = await addComment(db, issue.id, 'a deletar', ME);
      await addReaction(db, c.id, '👍', ME);
      const ok = await deleteComment(db, c.id, ME);
      expect(ok).toBe(true);
      const comments = await listComments(db, issue.id);
      expect(comments).toHaveLength(0);
   });

   it('forbids deleting a comment from another author (403)', async () => {
      const { db, issue } = await anIssue();
      const c = await addComment(db, issue.id, 'meu', ME);
      await expect(deleteComment(db, c.id, 'bob@nimbloo.ai')).rejects.toThrow();
      const comments = await listComments(db, issue.id);
      expect(comments).toHaveLength(1);
   });
});
