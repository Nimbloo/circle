import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue, updateIssue, listSubscribedIssueIds } from '@/lib/api/issues';
import { addComment } from '@/lib/api/issue-detail';
import { getMe } from '@/lib/api/users';

const CREATOR = 'ana.silva@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

describe('issue subscriptions (auto-subscribe)', () => {
   it('assina o criador ao criar a issue', async () => {
      const db = await setup();
      const i = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         CREATOR
      );
      const me = await getMe(db, CREATOR);
      expect(me.subscribedIssueIds).toContain(i.id);
   });

   it('assina o criador E o assignee inicial', async () => {
      const db = await setup();
      const bobId = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
      const i = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low', assigneeId: bobId },
         CREATOR
      );
      const ids = await listSubscribedIssueIds(db, bobId);
      expect(ids).toContain(i.id);
   });

   it('assina o novo responsável ao reatribuir', async () => {
      const db = await setup();
      const carolId = await seedUser(db, { name: 'Carol', email: 'carol@nimbloo.ai' });
      const i = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         CREATOR
      );
      expect(await listSubscribedIssueIds(db, carolId)).not.toContain(i.id);
      await updateIssue(db, i.id, { assigneeId: carolId }, CREATOR);
      expect(await listSubscribedIssueIds(db, carolId)).toContain(i.id);
   });

   it('assina quem comenta na issue', async () => {
      const db = await setup();
      const i = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         CREATOR
      );
      const daveEmail = 'dave@nimbloo.ai';
      await addComment(db, i.id, 'olhando isso', daveEmail);
      const me = await getMe(db, daveEmail);
      expect(me.subscribedIssueIds).toContain(i.id);
   });

   it('é idempotente (assinar duas vezes não duplica)', async () => {
      const db = await setup();
      const i = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         CREATOR
      );
      // re-assinar via nova atribuição ao mesmo criador não estoura PK
      await updateIssue(db, i.id, { title: 'Y' }, CREATOR);
      const me = await getMe(db, CREATOR);
      expect(me.subscribedIssueIds.filter((id) => id === i.id).length).toBe(1);
   });
});
