import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture } from './helpers/fixtures';
import { listLabels, createLabel, updateLabel, deleteLabel } from '@/lib/api/labels';
import { issueLabel } from '@/db/schema';
import { ApiError } from '@/lib/api/errors';

describe('labels CRUD', () => {
   it('cria label derivando o id do name (slug) e rejeita duplicado', async () => {
      const db = await makeTestDb();

      const created = await createLabel(db, { name: 'Tech Debt', color: 'orange' });
      expect(created).toEqual({ id: 'tech-debt', name: 'Tech Debt', color: 'orange' });

      const list = await listLabels(db);
      expect(list.some((l) => l.id === 'tech-debt')).toBe(true);

      // mesmo name → mesmo slug → 409
      await expect(createLabel(db, { name: 'Tech Debt', color: 'red' })).rejects.toMatchObject({
         status: 409,
      });
      await expect(createLabel(db, { name: 'Bug', color: 'red' })).rejects.toBeInstanceOf(ApiError);
   });

   it('respeita o id explícito quando fornecido', async () => {
      const db = await makeTestDb();
      const created = await createLabel(db, { id: 'custom-id', name: 'Qualquer', color: 'blue' });
      expect(created.id).toBe('custom-id');
   });

   it('atualiza name e color', async () => {
      const db = await makeTestDb();
      await createLabel(db, { id: 'x', name: 'Antigo', color: 'gray' });

      const patched = await updateLabel(db, 'x', { name: 'Novo', color: 'green' });
      expect(patched).toEqual({ id: 'x', name: 'Novo', color: 'green' });

      // patch parcial (só color)
      const onlyColor = await updateLabel(db, 'x', { color: 'red' });
      expect(onlyColor).toEqual({ id: 'x', name: 'Novo', color: 'red' });

      expect(await updateLabel(db, 'inexistente', { name: 'z' })).toBeNull();
   });

   it('deleta: some da lista e limpa issue_label', async () => {
      const db = await makeTestDb();
      const { issueId } = await seedWorkspaceFixture(db);

      await createLabel(db, { id: 'temp', name: 'Temporário', color: 'yellow' });
      await db.insert(issueLabel).values({ issueId, labelId: 'temp' });

      const removed = await deleteLabel(db, 'temp');
      expect(removed).toBe(true);

      const list = await listLabels(db);
      expect(list.some((l) => l.id === 'temp')).toBe(false);

      const joins = await db.select().from(issueLabel).where(eq(issueLabel.labelId, 'temp'));
      expect(joins).toHaveLength(0);

      expect(await deleteLabel(db, 'temp')).toBe(false);
   });
});
