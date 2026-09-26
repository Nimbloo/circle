import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import type { Db } from '@/db';
import { activityEvent, issue, notification } from '@/db/schema';
import { bulkUpdateIssues, createIssue } from '@/lib/api/issues';

/**
 * Ações em lote (#30): antes eram N PATCHes, e uma falha no meio deixava o lote pela
 * metade. Agora é uma transação só — ou todas as issues mudam, ou nenhuma.
 */
let db: Db;
const ADMIN = 'admin@nimbloo.ai';
const GUEST = 'guest@nimbloo.ai';
let bob = '';

const base = { title: 'Issue', statusId: 'to-do', priorityId: 'no-priority' };

async function statusOf(id: string) {
   const [row] = await db.select({ statusId: issue.statusId }).from(issue).where(eq(issue.id, id));
   return row.statusId;
}

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   await seedTeam(db, 'OPS', 'Ops');
   await seedUser(db, { name: 'Admin', email: ADMIN, teamIds: ['CORE', 'OPS'], role: 'Admin' });
   await seedUser(db, { name: 'Guest', email: GUEST, teamIds: ['CORE'], role: 'Guest' });
   bob = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai', teamIds: ['CORE'] });
});

describe('bulkUpdateIssues (#30)', () => {
   it('aplica o patch de cada issue, grava o histórico e devolve os DTOs', async () => {
      const a = await createIssue(db, { ...base, teamId: 'CORE' }, ADMIN);
      const b = await createIssue(db, { ...base, teamId: 'CORE' }, ADMIN);

      const dtos = await bulkUpdateIssues(
         db,
         [
            { id: a.id, patch: { statusId: 'done' } },
            { id: b.id, patch: { statusId: 'done', assigneeIds: [bob] } },
         ],
         ADMIN
      );

      expect(dtos.map((d) => d.id).sort()).toEqual([a.id, b.id].sort());
      expect(dtos.every((d) => d.status?.id === 'done')).toBe(true);
      expect(dtos.find((d) => d.id === b.id)?.assignee?.id).toBe(bob);
      const events = await db
         .select()
         .from(activityEvent)
         .where(and(eq(activityEvent.issueId, a.id), eq(activityEvent.event, 'status')));
      expect(events).toHaveLength(1);
   });

   it('efeitos por issue (notificação de atribuição) saem depois da resposta', async () => {
      const a = await createIssue(db, { ...base, teamId: 'CORE' }, ADMIN);
      await bulkUpdateIssues(db, [{ id: a.id, patch: { assigneeIds: [bob] } }], ADMIN);
      await vi.waitFor(async () => {
         const rows = await db
            .select()
            .from(notification)
            .where(and(eq(notification.issueId, a.id), eq(notification.recipientId, bob)));
         expect(rows).toHaveLength(1);
      });
   });

   it('uma issue inexistente no lote desfaz todas (404)', async () => {
      const a = await createIssue(db, { ...base, teamId: 'CORE' }, ADMIN);
      await expect(
         bulkUpdateIssues(
            db,
            [
               { id: a.id, patch: { statusId: 'done' } },
               { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', patch: { statusId: 'done' } },
            ],
            ADMIN
         )
      ).rejects.toMatchObject({ status: 404 });
      expect(await statusOf(a.id)).toBe('to-do');
   });

   it('uma issue fora do escopo do ator desfaz todas (403)', async () => {
      const mine = await createIssue(db, { ...base, teamId: 'CORE' }, ADMIN);
      const other = await createIssue(db, { ...base, teamId: 'OPS' }, ADMIN);
      await expect(
         bulkUpdateIssues(
            db,
            [
               { id: mine.id, patch: { priorityId: 'urgent' } },
               { id: other.id, patch: { priorityId: 'urgent' } },
            ],
            GUEST
         )
      ).rejects.toMatchObject({ status: 403 });
      const rows = await db.select({ p: issue.priorityId }).from(issue);
      expect(rows.every((r) => r.p === 'no-priority')).toBe(true);
   });

   it('issue repetida no lote → 400', async () => {
      const a = await createIssue(db, { ...base, teamId: 'CORE' }, ADMIN);
      await expect(
         bulkUpdateIssues(
            db,
            [
               { id: a.id, patch: { statusId: 'done' } },
               { id: a.id, patch: { statusId: 'to-do' } },
            ],
            ADMIN
         )
      ).rejects.toMatchObject({ status: 400 });
   });
});
