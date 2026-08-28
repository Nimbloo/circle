import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import { addComment, listComments, deleteComment, listActivity } from '@/lib/api/issue-detail';

const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA });
   await seedUser(db, { name: 'Bob', email: BOB });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ANA
   );
   return { db, issueId: issue.id };
}

describe('comment threading (#25)', () => {
   it('resposta aponta parentId para o comentário-raiz', async () => {
      const { db, issueId } = await setup();
      const root = await addComment(db, issueId, 'raiz', ANA);
      expect(root.parentId).toBeNull();
      const reply = await addComment(db, issueId, 'resposta', BOB, root.id);
      expect(reply.parentId).toBe(root.id);
   });

   it('responder a uma resposta ancora no mesmo pai raiz (1 nível)', async () => {
      const { db, issueId } = await setup();
      const root = await addComment(db, issueId, 'raiz', ANA);
      const reply = await addComment(db, issueId, 'r1', BOB, root.id);
      const nested = await addComment(db, issueId, 'r2', ANA, reply.id);
      expect(nested.parentId).toBe(root.id); // não reply.id
   });

   it('rejeita pai de outra issue (400)', async () => {
      const { db, issueId } = await setup();
      const other = await createIssue(
         db,
         { teamId: 'CORE', title: 'Y', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      const rootOther = await addComment(db, other.id, 'raiz outra', ANA);
      await expect(addComment(db, issueId, 'x', BOB, rootOther.id)).rejects.toThrow();
   });

   it('excluir a raiz remove as respostas', async () => {
      const { db, issueId } = await setup();
      const root = await addComment(db, issueId, 'raiz', ANA);
      await addComment(db, issueId, 'r1', BOB, root.id);
      await addComment(db, issueId, 'r2', BOB, root.id);
      expect(await listComments(db, issueId)).toHaveLength(3);

      await deleteComment(db, root.id, ANA);
      expect(await listComments(db, issueId)).toHaveLength(0);
   });

   it('listActivity expõe parentId nas respostas', async () => {
      const { db, issueId } = await setup();
      const root = await addComment(db, issueId, 'raiz', ANA);
      await addComment(db, issueId, 'resposta', BOB, root.id);
      const activity = await listActivity(db, issueId);
      const comments = activity.filter((a) => a.kind === 'comment');
      const reply = comments.find((c) => c.body === 'resposta');
      expect(reply?.parentId).toBe(root.id);
   });
});
