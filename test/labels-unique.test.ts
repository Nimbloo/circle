import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { createLabel, updateLabel } from '@/lib/api/labels';

/**
 * Ad#34 — renomear aceitava nome duplicado, e criar dava 409 quando só o SLUG colidia
 * (nomes diferentes que viram o mesmo id). O nome é a chave para o usuário; o id é gerado.
 */
describe('labels: nome único e slug único (Ad#34)', () => {
   it('nomes diferentes com o mesmo slug ganham ids distintos', async () => {
      const db = await makeTestDb();
      const a = await createLabel(db, { name: 'Tech Debt', color: 'orange' });
      const b = await createLabel(db, { name: 'Tech-Debt', color: 'red' });
      const c = await createLabel(db, { name: 'Tech  Debt!', color: 'blue' });
      expect(a.id).toBe('tech-debt');
      expect(new Set([a.id, b.id, c.id]).size).toBe(3);
      expect(b.id).toMatch(/^tech-debt-/);
   });

   it('nome sem caractere de slug ainda gera um id', async () => {
      const db = await makeTestDb();
      const created = await createLabel(db, { name: '🔥', color: 'red' });
      expect(created.id).toBeTruthy();
      expect(created.name).toBe('🔥');
   });

   it('criar com nome já usado (sem diferenciar caixa) é 409', async () => {
      const db = await makeTestDb();
      await createLabel(db, { name: 'Tech Debt', color: 'orange' });
      await expect(createLabel(db, { name: 'tech debt', color: 'red' })).rejects.toMatchObject({
         status: 409,
      });
   });

   it('renomear para o nome de outra label é 409; manter o próprio nome não', async () => {
      const db = await makeTestDb();
      await createLabel(db, { id: 'a', name: 'Alpha', color: 'red' });
      await createLabel(db, { id: 'b', name: 'Beta', color: 'blue' });
      await expect(updateLabel(db, 'b', { name: ' alpha ' })).rejects.toMatchObject({
         status: 409,
      });
      expect(await updateLabel(db, 'b', { name: 'BETA' })).toMatchObject({ name: 'BETA' });
   });
});
