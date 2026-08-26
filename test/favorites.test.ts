import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue, deleteIssue } from '@/lib/api/issues';
import { toggleFavorite, isFavorite, listFavoriteIds } from '@/lib/api/favorites';

const ME = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const ana = await seedUser(db, { name: 'Ana', email: ME });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ME
   );
   return { db, ana, issue };
}

describe('issue favorites', () => {
   it('toggle adiciona e remove; isFavorite/list refletem', async () => {
      const { db, ana, issue } = await setup();
      expect(await isFavorite(db, issue.id, ana)).toBe(false);

      expect(await toggleFavorite(db, issue.id, ana)).toBe(true); // adiciona
      expect(await isFavorite(db, issue.id, ana)).toBe(true);
      expect(await listFavoriteIds(db, ana)).toContain(issue.id);

      expect(await toggleFavorite(db, issue.id, ana)).toBe(false); // remove
      expect(await isFavorite(db, issue.id, ana)).toBe(false);
      expect(await listFavoriteIds(db, ana)).not.toContain(issue.id);
   });

   it('favoritar é idempotente (toggle duas vezes = adiciona/remove, sem duplicar)', async () => {
      const { db, ana, issue } = await setup();
      await toggleFavorite(db, issue.id, ana);
      // segundo usuário favorita a mesma issue — não conflita
      const bob = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai' });
      await toggleFavorite(db, issue.id, bob);
      expect(await listFavoriteIds(db, ana)).toHaveLength(1);
      expect(await listFavoriteIds(db, bob)).toHaveLength(1);
   });

   it('deleteIssue limpa os favoritos (sem FK 23503)', async () => {
      const { db, ana, issue } = await setup();
      await toggleFavorite(db, issue.id, ana);
      expect(await deleteIssue(db, issue.id)).toBe(true);
      expect(await listFavoriteIds(db, ana)).toHaveLength(0);
   });
});
