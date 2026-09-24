import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import {
   comment as commentT,
   commentReaction,
   attachment as attachmentT,
   issueSubscription,
} from '@/db/schema';
import { addComment, deleteComment, updateComment } from '@/lib/api/issue-detail';
import { listInbox } from '@/lib/api/notifications';

const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA });
   const bob = await seedUser(db, { name: 'Bob', email: BOB });
   const danilo = await seedUser(db, { name: 'Danilo', email: 'danilo@nimbloo.ai' });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ANA
   );
   return { db, issueId: issue.id, bob, danilo };
}

describe('menções', () => {
   it('pontuação no fim da menção ainda notifica', async () => {
      const { db, issueId, bob } = await setup();
      await addComment(db, issueId, 'valeu @bob.', ANA);
      await vi.waitFor(async () =>
         expect((await listInbox(db, bob)).some((n) => n.type === 'mention')).toBe(true)
      );
   });

   it('editar adicionando menção nova notifica só a menção nova', async () => {
      const { db, issueId, bob, danilo } = await setup();
      const c = await addComment(db, issueId, 'oi @bob', ANA);
      await vi.waitFor(async () =>
         expect((await listInbox(db, bob)).filter((n) => n.type === 'mention')).toHaveLength(1)
      );
      await updateComment(db, c.id, 'oi @bob e @danilo!', ANA);
      await vi.waitFor(async () =>
         expect((await listInbox(db, danilo)).filter((n) => n.type === 'mention')).toHaveLength(1)
      );
      // bob já tinha sido mencionado: a edição não o notifica de novo
      expect((await listInbox(db, bob)).filter((n) => n.type === 'mention')).toHaveLength(1);
      // quem é mencionado passa a seguir a issue
      const subs = await db
         .select()
         .from(issueSubscription)
         .where(eq(issueSubscription.userId, danilo));
      expect(subs).toHaveLength(1);
   });
});

/** Db que falha no insert/delete da tabela dada — também dentro de transação. */
function failingOn(db: Db, op: 'insert' | 'delete', table: unknown): Db {
   const wrap = <T extends object>(target: T): T =>
      new Proxy(target, {
         get(t, prop, recv) {
            const value = Reflect.get(t, prop, recv);
            if (prop === op)
               return (tbl: unknown) => {
                  if (tbl === table) throw new Error('falha simulada');
                  return (value as (x: unknown) => unknown).call(t, tbl);
               };
            if (prop === 'transaction')
               return (fn: (tx: object) => unknown) =>
                  (value as (f: (tx: object) => unknown) => unknown).call(t, (tx: object) =>
                     fn(wrap(tx))
                  );
            return typeof value === 'function' ? value.bind(t) : value;
         },
      });
   return wrap(db);
}

describe('atomicidade', () => {
   it('addComment: falha na subscription não deixa o comentário gravado', async () => {
      const { db, issueId } = await setup();
      await expect(
         addComment(failingOn(db, 'insert', issueSubscription), issueId, 'oi', ANA)
      ).rejects.toThrow();
      expect(await db.select().from(commentT).where(eq(commentT.issueId, issueId))).toHaveLength(0);
   });

   it('deleteComment: falha no delete do comentário preserva reações e anexos', async () => {
      const { db, issueId, bob } = await setup();
      const c = await addComment(db, issueId, 'oi', ANA);
      await db.insert(commentReaction).values({ commentId: c.id, emoji: '👍', userId: bob });
      await db.insert(attachmentT).values({
         id: randomUUID(),
         issueId,
         commentId: c.id,
         uploadedById: bob,
         url: 'https://cdn.test/x.png',
         fileName: 'x.png',
         contentType: 'image/png',
         size: 1,
      });
      await expect(deleteComment(failingOn(db, 'delete', commentT), c.id, ANA)).rejects.toThrow();
      expect(await db.select().from(commentReaction)).toHaveLength(1);
      expect(await db.select().from(attachmentT)).toHaveLength(1);
   });
});
