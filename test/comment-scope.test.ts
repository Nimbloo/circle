import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { teamMember } from '@/db/schema';
import { createIssue } from '@/lib/api/issues';
import {
   addComment,
   addReaction,
   deleteComment,
   removeReaction,
   resolveComment,
   updateComment,
} from '@/lib/api/issue-detail';
import { POST as addReactionRoute } from '@/app/api/v1/comments/[id]/reactions/route';

/**
 * Auditoria 23/09: reação a comentário não checava escopo (um convidado reagia em
 * comentário de outro time sabendo o id) e o emoji não tinha limite (varchar(32) → 500).
 * Editar, resolver e excluir checavam só autoria — quem perdeu o time seguia mexendo.
 */
const ADMIN = 'ana@nimbloo.ai';
const GUEST = 'guest@nimbloo.ai';
let db: Db;
let guestId = '';
let openIssue = '';
let secretComment = '';

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'OPEN', 'Open');
   await seedTeam(db, 'SECRET', 'Secret');
   await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['OPEN', 'SECRET'] });
   guestId = await seedUser(db, { name: 'Guest', email: GUEST, role: 'Guest', teamIds: ['OPEN'] });
   const base = { statusId: 'to-do', priorityId: 'high' };
   openIssue = (await createIssue(db, { ...base, teamId: 'OPEN', title: 'aberta' }, ADMIN)).id;
   const secretIssue = (await createIssue(db, { ...base, teamId: 'SECRET', title: 's' }, ADMIN)).id;
   secretComment = (await addComment(db, secretIssue, 'segredo', ADMIN)).id;
});
afterEach(() => __setTestDb(null));

describe('escopo nas mutações de comentário', () => {
   it('reagir (e desfazer) em comentário de time fora do escopo: 403', async () => {
      await expect(addReaction(db, secretComment, '👍', GUEST)).rejects.toMatchObject({
         status: 403,
      });
      await expect(removeReaction(db, secretComment, '👍', GUEST)).rejects.toMatchObject({
         status: 403,
      });
   });

   it('reagir em comentário inexistente: 404', async () => {
      await expect(addReaction(db, 'nope', '👍', GUEST)).rejects.toMatchObject({ status: 404 });
   });

   it('emoji acima de 32 caracteres é 400 (não 500 do banco)', async () => {
      const own = await addComment(db, openIssue, 'oi', GUEST);
      const res = await addReactionRoute(
         new Request(`http://x/api/v1/comments/${own.id}/reactions`, {
            method: 'POST',
            headers: { 'x-forwarded-email': GUEST, 'content-type': 'application/json' },
            body: JSON.stringify({ emoji: ':' + 'x'.repeat(40) + ':' }),
         }),
         { params: Promise.resolve({ id: own.id }) }
      );
      expect(res.status).toBe(400);
   });

   it('autor que saiu do time não edita, resolve nem exclui o próprio comentário', async () => {
      const own = await addComment(db, openIssue, 'meu', GUEST);
      await db
         .delete(teamMember)
         .where(and(eq(teamMember.userId, guestId), eq(teamMember.teamId, 'OPEN')));
      await expect(updateComment(db, own.id, 'editado', GUEST)).rejects.toMatchObject({
         status: 403,
      });
      await expect(resolveComment(db, own.id, true, GUEST)).rejects.toMatchObject({
         status: 403,
      });
      await expect(deleteComment(db, own.id, GUEST)).rejects.toMatchObject({ status: 403 });
   });

   it('dentro do escopo tudo continua funcionando', async () => {
      const own = await addComment(db, openIssue, 'meu', GUEST);
      await addReaction(db, own.id, '👍', GUEST);
      await removeReaction(db, own.id, '👍', GUEST);
      expect((await updateComment(db, own.id, 'editado', GUEST))?.body).toBe('editado');
      expect(await deleteComment(db, own.id, GUEST)).toBe(true);
   });
});
