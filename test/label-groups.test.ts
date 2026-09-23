import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture } from './helpers/fixtures';
import {
   createLabel,
   createLabelGroup,
   deleteLabelGroup,
   listLabelGroups,
   listLabels,
   updateLabel,
   updateLabelGroup,
} from '@/lib/api/labels';
import { addLabel } from '@/lib/api/issues';
import { issue as issueT, issueLabel, label as labelT } from '@/db/schema';
import { bootstrapWorkspace } from '@/lib/api/workspace';
import { subscribe, type CircleEvent } from '@/lib/api/events';

describe('grupos de label (paridade Linear)', () => {
   it('o seed traz o grupo das labels semeadas com grupo', async () => {
      const db = await makeTestDb();
      const groups = await listLabelGroups(db);
      expect(groups.map((g) => g.id)).toContain('kind');
      const bug = (await listLabels(db)).find((l) => l.id === 'bug');
      expect(bug?.groupId).toBe('kind');
   });

   it('cria, renomeia e exclui grupo; excluir solta as labels (não as apaga)', async () => {
      const db = await makeTestDb();
      const group = await createLabelGroup(db, { name: '  Area  ', color: 'blue' });
      expect(group).toMatchObject({ id: 'area', name: 'Area', color: 'blue' });

      const l = await createLabel(db, { name: 'Frontend', color: 'green', groupId: group.id });
      expect(l.groupId).toBe('area');

      const renamed = await updateLabelGroup(db, group.id, { name: 'Área' });
      expect(renamed?.name).toBe('Área');

      expect(await deleteLabelGroup(db, group.id)).toBe(true);
      expect((await listLabelGroups(db)).some((g) => g.id === 'area')).toBe(false);
      const [row] = await db.select().from(labelT).where(eq(labelT.id, l.id));
      expect(row.groupId).toBeNull();
   });

   it('recusa nome de grupo duplicado (409) e vazio (400)', async () => {
      const db = await makeTestDb();
      await createLabelGroup(db, { name: 'Area', color: 'blue' });
      await expect(createLabelGroup(db, { name: 'area', color: 'red' })).rejects.toMatchObject({
         status: 409,
      });
      await expect(createLabelGroup(db, { name: '   ', color: 'red' })).rejects.toMatchObject({
         status: 400,
      });
   });

   it('label não entra em grupo inexistente (400) e pode sair do grupo', async () => {
      const db = await makeTestDb();
      await expect(
         createLabel(db, { name: 'X', color: 'red', groupId: 'nope' })
      ).rejects.toMatchObject({ status: 400 });
      const moved = await updateLabel(db, 'bug', { groupId: null });
      expect(moved?.groupId).toBeNull();
      const back = await updateLabel(db, 'bug', { groupId: 'kind' });
      expect(back?.groupId).toBe('kind');
   });

   it('grupo novo é exclusivo na issue: a label do mesmo grupo substitui a anterior', async () => {
      const db = await makeTestDb();
      const { issueId, ownerEmail: email } = await seedWorkspaceFixture(db);
      const group = await createLabelGroup(db, { name: 'Area', color: 'blue' });
      const fe = await createLabel(db, { name: 'Frontend', color: 'green', groupId: group.id });
      const be = await createLabel(db, { name: 'Backend', color: 'red', groupId: group.id });
      await addLabel(db, issueId, fe.id, email);
      await addLabel(db, issueId, be.id, email);
      const rows = await db.select().from(issueLabel).where(eq(issueLabel.issueId, issueId));
      expect(rows.map((r) => r.labelId)).toEqual([be.id]);
   });

   it('mover uma label existente para um grupo desvincula o conflito nas issues (Ad#XX)', async () => {
      const db = await makeTestDb();
      const { issueId, teamId, ownerEmail: email } = await seedWorkspaceFixture(db);
      const group = await createLabelGroup(db, { name: 'Area', color: 'blue' });
      const inGroup = await createLabel(db, {
         name: 'Frontend',
         color: 'green',
         groupId: group.id,
      });
      // "Solta" no começo — é essa que vai ser MOVIDA para o grupo depois.
      const loose = await createLabel(db, { name: 'Urgent-ish', color: 'red' });
      await addLabel(db, issueId, inGroup.id, email);
      await addLabel(db, issueId, loose.id, email);
      // As duas convivem antes do move (grupos diferentes/nenhum grupo).
      let rows = await db.select().from(issueLabel).where(eq(issueLabel.issueId, issueId));
      expect(rows.map((r) => r.labelId).sort()).toEqual([inGroup.id, loose.id].sort());

      const received: CircleEvent[] = [];
      const unsub = subscribe((e) => {
         if (e.entity === 'issue') received.push(e);
      });
      try {
         await updateLabel(db, loose.id, { groupId: group.id });
      } finally {
         unsub();
      }

      // Determinístico: a label que já estava no grupo (inGroup) fica; a movida (loose)
      // é desvinculada da issue — ela não apaga a label, só o vínculo com ESSA issue.
      rows = await db.select().from(issueLabel).where(eq(issueLabel.issueId, issueId));
      expect(rows.map((r) => r.labelId)).toEqual([inGroup.id]);

      // A label movida continua existindo, agora no grupo.
      const [movedRow] = await db.select().from(labelT).where(eq(labelT.id, loose.id));
      expect(movedRow.groupId).toBe(group.id);

      // Avisa a issue afetada (id + teamId) — não é o `label` genérico só.
      expect(received.some((e) => e.id === issueId && e.teamId === teamId)).toBe(true);
   });

   it('mover uma label sem conflito em nenhuma issue não desvincula nada', async () => {
      const db = await makeTestDb();
      const { issueId, ownerEmail: email } = await seedWorkspaceFixture(db);
      const group = await createLabelGroup(db, { name: 'Area', color: 'blue' });
      const loose = await createLabel(db, { name: 'Solo', color: 'red' });
      await addLabel(db, issueId, loose.id, email);

      await updateLabel(db, loose.id, { groupId: group.id });

      const rows = await db.select().from(issueLabel).where(eq(issueLabel.issueId, issueId));
      expect(rows.map((r) => r.labelId)).toEqual([loose.id]);
   });

   it('coarse: mais de 20 issues afetadas publica 1 evento por time, sem id', async () => {
      const db = await makeTestDb();
      const { teamId, ownerEmail: email } = await seedWorkspaceFixture(db);
      const group = await createLabelGroup(db, { name: 'Area', color: 'blue' });
      const inGroup = await createLabel(db, {
         name: 'Frontend',
         color: 'green',
         groupId: group.id,
      });
      const loose = await createLabel(db, { name: 'Loose', color: 'red' });

      const now = new Date('2026-01-01T00:00:00Z');
      const ids: string[] = [];
      for (let i = 0; i < 21; i++) {
         const id = `bulk-${i}`;
         ids.push(id);
         await db.insert(issueT).values({
            id,
            identifier: `CORE-bulk-${i}`,
            teamId,
            title: `Bulk ${i}`,
            statusId: 'to-do',
            priorityId: 'no-priority',
            rank: id,
            createdAt: now,
            updatedAt: now,
         });
         await addLabel(db, id, inGroup.id, email);
         await addLabel(db, id, loose.id, email);
      }

      const received: CircleEvent[] = [];
      const unsub = subscribe((e) => {
         if (e.entity === 'issue') received.push(e);
      });
      try {
         await updateLabel(db, loose.id, { groupId: group.id });
      } finally {
         unsub();
      }

      // Coarse: 1 evento por time, sem `id` (não 21 eventos individuais).
      expect(received).toHaveLength(1);
      expect(received[0].teamId).toBe(teamId);
      expect(received[0].id).toBeUndefined();

      for (const id of ids) {
         const rows = await db.select().from(issueLabel).where(eq(issueLabel.issueId, id));
         expect(rows.map((r) => r.labelId)).toEqual([inGroup.id]);
      }
   });

   it('o bootstrap do workspace expõe os grupos (aditivo)', async () => {
      const db = await makeTestDb();
      const { ownerEmail: email } = await seedWorkspaceFixture(db);
      const boot = await bootstrapWorkspace(db, email, { rollover: false });
      expect(boot.labelGroups.map((g) => g.id)).toContain('kind');
      expect(boot.labels.find((l) => l.id === 'bug')?.groupId).toBe('kind');
   });
});
