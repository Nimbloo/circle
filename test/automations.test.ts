import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { activityEvent, auditLog, issue as issueT, issueLabel } from '@/db/schema';
import { createIssue, getIssue, updateIssue } from '@/lib/api/issues';
import {
   createAutomation,
   deleteAutomation,
   listTeamAutomations,
   runAutomations,
   updateAutomation,
   MAX_AUTOMATION_DEPTH,
} from '@/lib/api/automations';

const ANA = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const anaId = await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin' });
   const bobId = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
   return { db, anaId, bobId };
}

/** Labels do catálogo semeado (`seedCatalogs`). */
async function firstLabels(db: Awaited<ReturnType<typeof makeTestDb>>) {
   const { label } = await import('@/db/schema');
   const rows = await db.select().from(label);
   return rows;
}

describe('CRUD de automações', () => {
   it('semeia a regra default do PR mergeado e valida os parâmetros', async () => {
      const { db } = await setup();
      const seeded = await listTeamAutomations(db, 'CORE');
      expect(seeded).toHaveLength(1);
      expect(seeded[0]).toMatchObject({
         trigger: 'pr.merged',
         action: 'set_status',
         enabled: true,
      });
      expect(seeded[0].config.statusId).toBeTruthy();
      // Idempotente: uma segunda leitura não semeia de novo.
      expect(await listTeamAutomations(db, 'CORE')).toHaveLength(1);

      await expect(
         createAutomation(db, 'CORE', {
            name: 'Sem label',
            trigger: 'issue.label_added',
            action: 'set_priority',
            config: { priorityId: 'urgent' },
         })
      ).rejects.toMatchObject({ status: 400 });
      await expect(
         createAutomation(db, 'CORE', {
            name: 'Sem status',
            trigger: 'pr.merged',
            action: 'set_status',
            config: {},
         })
      ).rejects.toMatchObject({ status: 400 });
      await expect(
         createAutomation(db, 'NOPE', {
            name: 'X',
            trigger: 'pr.merged',
            action: 'set_priority',
            config: { priorityId: 'urgent' },
         })
      ).rejects.toMatchObject({ status: 404 });
   });

   it('cria, atualiza (toggle) e exclui', async () => {
      const { db } = await setup();
      const created = await createAutomation(db, 'CORE', {
         name: 'Triage → urgente',
         trigger: 'issue.created_in_triage',
         action: 'set_priority',
         config: { priorityId: 'urgent' },
      });
      expect(created.enabled).toBe(true);
      const off = await updateAutomation(db, created.id, { enabled: false });
      expect(off?.enabled).toBe(false);
      expect(await updateAutomation(db, 'nope', { enabled: true })).toBeNull();
      expect(await deleteAutomation(db, created.id)).toBe(true);
      expect(await deleteAutomation(db, created.id)).toBe(false);
   });
});

describe('motor — três automações de ponta a ponta', () => {
   it('issue.created_in_triage aplica prioridade e grava activity + audit', async () => {
      const { db } = await setup();
      await createAutomation(db, 'CORE', {
         name: 'Triage → urgente',
         trigger: 'issue.created_in_triage',
         action: 'set_priority',
         config: { priorityId: 'urgent' },
      });
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'Chegou do site', statusId: 'triage', priorityId: 'low' },
         ANA
      );
      const after = await getIssue(db, dto.id);
      expect(after?.priority.id).toBe('urgent');

      const events = await db
         .select()
         .from(activityEvent)
         .where(and(eq(activityEvent.issueId, dto.id), eq(activityEvent.event, 'automation')));
      expect(events).toHaveLength(1);
      expect(events[0].text).toContain('Triage → urgente');

      const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'automation.run'));
      expect(audits).toHaveLength(1);
      expect(JSON.parse(audits[0].meta!)).toMatchObject({ trigger: 'issue.created_in_triage' });
   });

   it('issue.label_added adiciona label e issue.status_changed fecha as sub-issues', async () => {
      const { db } = await setup();
      const labels = await firstLabels(db);
      const trigger = labels[0];
      const applied = labels[1];

      // `triggerLabelId` = label que dispara; `labelId` = label aplicada pela ação.
      await createAutomation(db, 'CORE', {
         name: `${trigger.name} → ${applied.name}`,
         trigger: 'issue.label_added',
         action: 'add_label',
         config: { triggerLabelId: trigger.id, labelId: applied.id },
      });

      const parent = await createIssue(
         db,
         { teamId: 'CORE', title: 'Pai', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      const child = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'Filha',
            statusId: 'to-do',
            priorityId: 'low',
            parentId: parent.id,
         },
         ANA
      );

      const { addLabel } = await import('@/lib/api/issues');
      await addLabel(db, parent.id, trigger.id, ANA);
      const links = await db.select().from(issueLabel).where(eq(issueLabel.issueId, parent.id));
      expect(links.map((l) => l.labelId).sort()).toEqual([trigger.id, applied.id].sort());

      await createAutomation(db, 'CORE', {
         name: 'Done → fecha filhas',
         trigger: 'issue.status_changed',
         action: 'close_sub_issues',
         config: { toCategory: 'completed' },
      });
      await updateIssue(db, parent.id, { statusId: 'done' }, ANA);
      const after = await getIssue(db, child.id);
      expect(after?.status.category).toBe('completed');
   });

   it('pr.merged usa a regra default (PR mergeado → Done)', async () => {
      const { db } = await setup();
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'PR', statusId: 'in-progress', priorityId: 'low' },
         ANA
      );
      expect(await runAutomations(db, 'pr.merged', dto.id, { actorId: null })).toBe(1);
      expect((await getIssue(db, dto.id))?.status.category).toBe('completed');
      // Idempotente: rodar de novo não muda nada nem gera activity duplicada.
      expect(await runAutomations(db, 'pr.merged', dto.id, { actorId: null })).toBe(0);
   });
});

describe('anti-loop e profundidade', () => {
   it('uma regra não roda duas vezes na mesma cadeia', async () => {
      const { db } = await setup();
      const [a] = await firstLabels(db);
      // A regra reage à label X aplicando a MESMA label X: sem anti-loop, recursão infinita.
      const rule = await createAutomation(db, 'CORE', {
         name: 'Loop',
         trigger: 'issue.label_added',
         action: 'add_label',
         config: { triggerLabelId: a.id, labelId: a.id },
      });
      expect(rule.config.labelId).toBe(a.id);

      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'Loop', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      const applied = await runAutomations(db, 'issue.label_added', dto.id, {
         actorId: null,
         labelId: a.id,
      });
      expect(applied).toBe(1);
      const links = await db.select().from(issueLabel).where(eq(issueLabel.issueId, dto.id));
      expect(links).toHaveLength(1);
   });

   it('encadeamento respeita a profundidade máxima', async () => {
      const { db } = await setup();
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'Fundo', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      await createAutomation(db, 'CORE', {
         name: 'Backlog → urgente',
         trigger: 'issue.status_changed',
         action: 'set_priority',
         config: { priorityId: 'urgent' },
      });
      const applied = await runAutomations(db, 'issue.status_changed', dto.id, {
         actorId: null,
         toCategory: 'unstarted',
         depth: MAX_AUTOMATION_DEPTH,
      });
      expect(applied).toBe(0);
      expect((await db.select().from(issueT).where(eq(issueT.id, dto.id)))[0].priorityId).toBe(
         'low'
      );
   });

   it('regra desligada não roda; filtro de categoria respeitado', async () => {
      const { db } = await setup();
      const off = await createAutomation(db, 'CORE', {
         name: 'Desligada',
         trigger: 'issue.status_changed',
         action: 'set_priority',
         config: { priorityId: 'urgent' },
         enabled: false,
      });
      expect(off.enabled).toBe(false);
      await createAutomation(db, 'CORE', {
         name: 'Só em started',
         trigger: 'issue.status_changed',
         action: 'set_priority',
         config: { priorityId: 'high', toCategory: 'started' },
      });
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      expect(
         await runAutomations(db, 'issue.status_changed', dto.id, {
            actorId: null,
            toCategory: 'unstarted',
         })
      ).toBe(0);
      expect(
         await runAutomations(db, 'issue.status_changed', dto.id, {
            actorId: null,
            toCategory: 'started',
         })
      ).toBe(1);
      expect((await getIssue(db, dto.id))?.priority.id).toBe('high');
   });
});
