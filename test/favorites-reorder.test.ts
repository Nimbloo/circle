import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createProject } from '@/lib/api/projects';
import { addFavorite, listFavorites, reorderFavorites } from '@/lib/api/favorites';

/** co#16 — favoritos passam a ser reordenáveis (a coluna `position` já existia). */
async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
   await seedUser(db, { name: 'Bia', email: 'bia@nimbloo.ai', teamIds: ['CORE'] });
   const base = { priorityId: 'high', healthId: 'on-track', teamId: 'CORE' as const };
   const ids: string[] = [];
   for (const name of ['P1', 'P2', 'P3']) {
      const p = await createProject(db, { name, statusId: 'proj-in-progress', ...base });
      await addFavorite(db, 'ana@nimbloo.ai', 'project', p.id);
      ids.push(p.id);
   }
   const favorites = await listFavorites(db, 'ana@nimbloo.ai');
   return { db, favorites };
}

describe('reordenar favoritos', () => {
   it('grava a ordem enviada', async () => {
      const { db, favorites } = await setup();
      expect(favorites.map((f) => f.name)).toEqual(['P1', 'P2', 'P3']);
      const order = [favorites[2].id, favorites[0].id, favorites[1].id];
      await reorderFavorites(db, 'ana@nimbloo.ai', order);
      const after = await listFavorites(db, 'ana@nimbloo.ai');
      expect(after.map((f) => f.name)).toEqual(['P3', 'P1', 'P2']);
      expect(after.map((f) => f.position)).toEqual([0, 1, 2]);
   });

   it('ignora ids que não são do usuário (anti-IDOR)', async () => {
      const { db, favorites } = await setup();
      await reorderFavorites(db, 'bia@nimbloo.ai', [favorites[2].id, favorites[0].id]);
      const after = await listFavorites(db, 'ana@nimbloo.ai');
      expect(after.map((f) => f.name)).toEqual(['P1', 'P2', 'P3']);
   });

   it('ids ausentes ficam depois, na ordem atual', async () => {
      const { db, favorites } = await setup();
      await reorderFavorites(db, 'ana@nimbloo.ai', [favorites[1].id]);
      const after = await listFavorites(db, 'ana@nimbloo.ai');
      expect(after.map((f) => f.name)).toEqual(['P2', 'P1', 'P3']);
   });

   it('ids repetidos contam uma vez e não bagunçam as posições', async () => {
      const { db, favorites } = await setup();
      const res = await reorderFavorites(db, 'ana@nimbloo.ai', [
         favorites[2].id,
         favorites[2].id,
         favorites[0].id,
      ]);
      expect(res.reordered).toBe(2);
      const after = await listFavorites(db, 'ana@nimbloo.ai');
      expect(after.map((f) => f.name)).toEqual(['P3', 'P1', 'P2']);
      expect(after.map((f) => f.position)).toEqual([0, 1, 2]);
   });
});
