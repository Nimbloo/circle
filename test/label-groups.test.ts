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
import { issueLabel, label as labelT } from '@/db/schema';
import { bootstrapWorkspace } from '@/lib/api/workspace';

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

   it('o bootstrap do workspace expõe os grupos (aditivo)', async () => {
      const db = await makeTestDb();
      const { ownerEmail: email } = await seedWorkspaceFixture(db);
      const boot = await bootstrapWorkspace(db, email, { rollover: false });
      expect(boot.labelGroups.map((g) => g.id)).toContain('kind');
      expect(boot.labels.find((l) => l.id === 'bug')?.groupId).toBe('kind');
   });
});
