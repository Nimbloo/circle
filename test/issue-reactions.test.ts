import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import {
   addIssueReaction,
   removeIssueReaction,
   reactionsForIssue,
} from '@/lib/api/issue-detail';

const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const anaId = await seedUser(db, { name: 'Ana', email: ANA });
   const bobId = await seedUser(db, { name: 'Bob', email: BOB });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ANA
   );
   return { db, issueId: issue.id, anaId, bobId };
}

describe('issue reactions', () => {
   it('concatena emojis diferentes (não faz replace)', async () => {
      const { db, issueId } = await setup();
      await addIssueReaction(db, issueId, '❤️', ANA);
      await addIssueReaction(db, issueId, '👍', ANA);
      await addIssueReaction(db, issueId, '🚀', ANA);
      const emojis = (await reactionsForIssue(db, issueId)).map((r) => r.emoji).sort();
      expect(emojis).toEqual(['👍', '🚀', '❤️'].sort());
   });

   it('agrega contagem por emoji e marca reactedByMe', async () => {
      const { db, issueId, anaId } = await setup();
      await addIssueReaction(db, issueId, '🚀', ANA);
      await addIssueReaction(db, issueId, '🚀', BOB);
      const [rocket] = await reactionsForIssue(db, issueId, anaId);
      expect(rocket.emoji).toBe('🚀');
      expect(rocket.count).toBe(2);
      expect(rocket.reactedByMe).toBe(true);
   });

   it('mesmo usuário + mesmo emoji é idempotente', async () => {
      const { db, issueId } = await setup();
      await addIssueReaction(db, issueId, '🚀', ANA);
      await addIssueReaction(db, issueId, '🚀', ANA);
      const [rocket] = await reactionsForIssue(db, issueId);
      expect(rocket.count).toBe(1);
   });

   it('remove só a reação do próprio usuário', async () => {
      const { db, issueId, bobId } = await setup();
      await addIssueReaction(db, issueId, '🚀', ANA);
      await addIssueReaction(db, issueId, '🚀', BOB);
      await removeIssueReaction(db, issueId, '🚀', ANA);
      const [rocket] = await reactionsForIssue(db, issueId, bobId);
      expect(rocket.count).toBe(1);
      expect(rocket.reactedByMe).toBe(true); // sobrou a do Bob
   });
});
