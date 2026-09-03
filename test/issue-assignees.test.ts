import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { activityEvent, issue, issueAssignee, issueSubscription, notification } from '@/db/schema';
import { createIssue, deleteIssue, listIssues, updateIssue } from '@/lib/api/issues';

const ME = 'ana.silva@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const me = await seedUser(db, { name: 'Ana', email: ME });
   const bob = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
   const lia = await seedUser(db, { name: 'Lia', email: 'lia@nimbloo.ai' });
   return { db, me, bob, lia };
}

const base = { teamId: 'CORE', title: 'Multi', statusId: 'to-do', priorityId: 'high' };

async function junction(db: Awaited<ReturnType<typeof setup>>['db'], issueId: string) {
   const rows = await db
      .select({ userId: issueAssignee.userId })
      .from(issueAssignee)
      .where(eq(issueAssignee.issueId, issueId));
   return rows.map((r) => r.userId).sort();
}

describe('múltiplos responsáveis (#96)', () => {
   it('create com assigneeIds: principal = 1º, conjunto na ordem, junção e assinaturas', async () => {
      const { db, me, bob, lia } = await setup();
      const dto = await createIssue(db, { ...base, assigneeIds: [bob, lia, bob] }, ME);
      expect(dto.assignee?.id).toBe(bob);
      expect(dto.assignees.map((a) => a.id)).toEqual([bob, lia]);
      expect(await junction(db, dto.id)).toEqual([bob, lia].sort());
      const subs = await db
         .select({ userId: issueSubscription.userId })
         .from(issueSubscription)
         .where(eq(issueSubscription.issueId, dto.id));
      expect(subs.map((s) => s.userId).sort()).toEqual([me, bob, lia].sort());
   });

   it('create com assigneeId legado vira conjunto de 1', async () => {
      const { db, bob } = await setup();
      const dto = await createIssue(db, { ...base, assigneeId: bob }, ME);
      expect(dto.assignee?.id).toBe(bob);
      expect(dto.assignees.map((a) => a.id)).toEqual([bob]);
      expect(await junction(db, dto.id)).toEqual([bob]);
   });

   it('sem responsável: assignee null e assignees vazio', async () => {
      const { db } = await setup();
      const dto = await createIssue(db, base, ME);
      expect(dto.assignee).toBeNull();
      expect(dto.assignees).toEqual([]);
   });

   it('assigneeIds substitui o conjunto e deriva o principal; activity por pessoa', async () => {
      const { db, bob, lia, me } = await setup();
      const created = await createIssue(db, { ...base, assigneeIds: [bob] }, ME);

      const replaced = await updateIssue(db, created.id, { assigneeIds: [lia, me] }, ME);
      expect(replaced?.assignee?.id).toBe(lia);
      expect(replaced?.assignees.map((a) => a.id)).toEqual([lia, me]);
      expect(await junction(db, created.id)).toEqual([lia, me].sort());

      const events = await db
         .select({ text: activityEvent.text, event: activityEvent.event })
         .from(activityEvent)
         .where(eq(activityEvent.issueId, created.id));
      const texts = events.filter((e) => e.event === 'assignee').map((e) => e.text);
      expect(texts).toEqual(
         expect.arrayContaining([
            'added assignee Lia',
            'added assignee Ana',
            'removed assignee Bob',
         ])
      );
      expect(texts).not.toContain('changed assignee');

      const cleared = await updateIssue(db, created.id, { assigneeIds: [] }, ME);
      expect(cleared?.assignee).toBeNull();
      expect(cleared?.assignees).toEqual([]);
      expect(await junction(db, created.id)).toEqual([]);
   });

   it('assigneeId sozinho troca o principal e mantém os colaboradores', async () => {
      const { db, bob, lia, me } = await setup();
      const created = await createIssue(db, { ...base, assigneeIds: [bob, lia] }, ME);

      const swapped = await updateIssue(db, created.id, { assigneeId: me }, ME);
      expect(swapped?.assignee?.id).toBe(me);
      expect(swapped?.assignees.map((a) => a.id)).toEqual([me, lia]);

      // Desatribuir o principal promove o colaborador (o principal é sempre o 1º do conjunto).
      const unassigned = await updateIssue(db, created.id, { assigneeId: null }, ME);
      expect(unassigned?.assignee?.id).toBe(lia);
      expect(unassigned?.assignees.map((a) => a.id)).toEqual([lia]);
   });

   it('promover um colaborador a principal gera "changed assignee" (ninguém entra/sai)', async () => {
      const { db, bob, lia } = await setup();
      const created = await createIssue(db, { ...base, assigneeIds: [bob, lia] }, ME);
      await updateIssue(db, created.id, { assigneeIds: [lia, bob] }, ME);
      const events = await db
         .select({ text: activityEvent.text })
         .from(activityEvent)
         .where(eq(activityEvent.issueId, created.id));
      expect(events.map((e) => e.text)).toContain('changed assignee');
   });

   it('notifica e assina CADA novo responsável (não o ator)', async () => {
      const { db, bob, lia, me } = await setup();
      const created = await createIssue(db, base, ME);
      await updateIssue(db, created.id, { assigneeIds: [me, bob, lia] }, ME);

      await vi.waitFor(async () => {
         const rows = await db
            .select({ recipientId: notification.recipientId, type: notification.type })
            .from(notification)
            .where(eq(notification.issueId, created.id));
         expect(
            rows
               .filter((r) => r.type === 'assignment')
               .map((r) => r.recipientId)
               .sort()
         ).toEqual([bob, lia].sort());
      });
      const subs = await db
         .select({ userId: issueSubscription.userId })
         .from(issueSubscription)
         .where(eq(issueSubscription.issueId, created.id));
      expect(subs.map((s) => s.userId).sort()).toEqual([me, bob, lia].sort());
   });

   it('filtros assignee / unassigned / assigneeMe consideram a junção', async () => {
      const { db, bob, lia } = await setup();
      const both = await createIssue(db, { ...base, title: 'both', assigneeIds: [bob, lia] }, ME);
      const onlyBob = await createIssue(db, { ...base, title: 'bob', assigneeIds: [bob] }, ME);
      const nobody = await createIssue(db, { ...base, title: 'nobody' }, ME);

      const byLia = await listIssues(db, { assignee: [lia] });
      expect(byLia.map((i) => i.id)).toEqual([both.id]);

      const byBob = await listIssues(db, { assignee: [bob] });
      expect(byBob.map((i) => i.id).sort()).toEqual([both.id, onlyBob.id].sort());

      const unassigned = await listIssues(db, { assignee: ['unassigned'] });
      expect(unassigned.map((i) => i.id)).toEqual([nobody.id]);

      // `me` como colaboradora (não principal) — resolvido pelo e-mail.
      const mine = await listIssues(db, { assigneeMe: 'lia@nimbloo.ai' });
      expect(mine.map((i) => i.id)).toEqual([both.id]);
      // `assignee=me` da query string chega como ['me'] + assigneeMe: não é um id.
      const mineToken = await listIssues(db, { assignee: ['me'], assigneeMe: 'lia@nimbloo.ai' });
      expect(mineToken.map((i) => i.id)).toEqual([both.id]);
   });

   it('deleteIssue remove as linhas da junção', async () => {
      const { db, bob } = await setup();
      const created = await createIssue(db, { ...base, assigneeIds: [bob] }, ME);
      expect(await deleteIssue(db, created.id)).toBe(true);
      expect(await junction(db, created.id)).toEqual([]);
   });

   it('backfill da migration é idempotente (uma linha por assignee_id não nulo)', async () => {
      const { db, bob } = await setup();
      // Issue "legada": gravada direto, sem passar pela API (junção vazia).
      const legacyId = randomUUID();
      await db.insert(issue).values({
         id: legacyId,
         identifier: 'CORE-900',
         teamId: 'CORE',
         title: 'legada',
         statusId: 'to-do',
         priorityId: 'high',
         assigneeId: bob,
         rank: 'zz',
      });
      await db.insert(issue).values({
         id: randomUUID(),
         identifier: 'CORE-901',
         teamId: 'CORE',
         title: 'sem responsável',
         statusId: 'to-do',
         priorityId: 'high',
         assigneeId: null,
         rank: 'zzz',
      });
      const migration = readFileSync('db/migrations/0042_backfill_issue_assignee.sql', 'utf8');
      const backfill = migration.split('--> statement-breakpoint').at(-1)!;

      await db.execute(sql.raw(backfill));
      await db.execute(sql.raw(backfill));

      const rows = await db.select().from(issueAssignee);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ issueId: legacyId, userId: bob });

      const [dto] = await listIssues(db, { assignee: [bob] });
      expect(dto.id).toBe(legacyId);
      expect(dto.assignees.map((a) => a.id)).toEqual([bob]);
   });
});
