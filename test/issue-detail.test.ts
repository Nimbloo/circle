import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import {
   getIssueDetail,
   addComment,
   listComments,
   listActivity,
   addReaction,
   removeReaction,
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
});
