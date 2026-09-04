import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import {
   createInitiative,
   updateInitiative,
   getInitiative,
   deleteInitiative,
} from '@/lib/api/initiatives';
import { createProject } from '@/lib/api/projects';
import { initiativeAncestorIds, initiativeDescendantIds } from '@/lib/api/hierarchy';
import type { Db } from '@/db';

const BASE = { priorityId: 'high', healthId: 'on-track' };

async function seedInitiative(db: Db, slug: string, name = slug) {
   return createInitiative(db, { ...BASE, slug, name });
}

describe('sub-initiatives (#100)', () => {
   it('grava o pai, expõe childIds ordenados e desvincula com null', async () => {
      const db = await makeTestDb();
      const mother = await seedInitiative(db, 'mother', 'Mother');
      const b = await seedInitiative(db, 'beta', 'Beta');
      const a = await seedInitiative(db, 'alpha', 'Alpha');

      await updateInitiative(db, b.id, { parentId: mother.id });
      await updateInitiative(db, a.id, { parentId: mother.id });

      const reloaded = (await getInitiative(db, mother.id))!;
      expect(reloaded.childIds).toEqual([a.id, b.id]); // por nome: Alpha, Beta
      expect((await getInitiative(db, a.id))!.parentId).toBe(mother.id);

      await updateInitiative(db, a.id, { parentId: null });
      expect((await getInitiative(db, a.id))!.parentId).toBeNull();
      expect((await getInitiative(db, mother.id))!.childIds).toEqual([b.id]);
   });

   it('createInitiative aceita parentId e recusa pai inexistente', async () => {
      const db = await makeTestDb();
      const mother = await seedInitiative(db, 'mother');
      const child = await createInitiative(db, {
         ...BASE,
         slug: 'child',
         name: 'Child',
         parentId: mother.id,
      });
      expect(child.parentId).toBe(mother.id);
      await expect(
         createInitiative(db, { ...BASE, slug: 'x', name: 'X', parentId: 'nope' })
      ).rejects.toMatchObject({ status: 400 });
   });

   it('recusa ciclo (pai de si mesma e pai descendente)', async () => {
      const db = await makeTestDb();
      const a = await seedInitiative(db, 'a', 'A');
      const b = await seedInitiative(db, 'b', 'B');
      const c = await seedInitiative(db, 'c', 'C');
      await updateInitiative(db, b.id, { parentId: a.id });
      await updateInitiative(db, c.id, { parentId: b.id });

      await expect(updateInitiative(db, a.id, { parentId: a.id })).rejects.toMatchObject({
         status: 400,
      });
      await expect(updateInitiative(db, a.id, { parentId: c.id })).rejects.toMatchObject({
         status: 400,
      });
      expect(await initiativeDescendantIds(db, [a.id])).toHaveLength(3);
      expect(await initiativeAncestorIds(db, c.id)).toEqual([b.id, a.id]);
   });

   it('rollup soma os projetos da subárvore, sem contar duas vezes', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const mother = await seedInitiative(db, 'mother', 'Mother');
      const child = await seedInitiative(db, 'child', 'Child');
      await updateInitiative(db, child.id, { parentId: mother.id });

      const projBase = { statusId: 'proj-in-progress', ...BASE, teamId: 'CORE' };
      const p1 = await createProject(db, { ...projBase, name: 'P1' });
      const p2 = await createProject(db, { ...projBase, name: 'P2' });
      const done = await createProject(db, {
         ...projBase,
         name: 'Done',
         statusId: 'proj-completed',
      });

      await updateInitiative(db, mother.id, { projectIds: [p1.id] });
      // p2 e `done` na filha; p1 fica só na mãe.
      await updateInitiative(db, child.id, { projectIds: [p2.id, done.id] });

      const reloaded = (await getInitiative(db, mother.id))!;
      expect(reloaded.projectCount).toBe(1); // próprios
      expect(reloaded.rollupProjectCount).toBe(3); // mãe + filha
      expect(reloaded.rollupCompletedProjectCount).toBe(1);

      const kid = (await getInitiative(db, child.id))!;
      expect(kid.rollupProjectCount).toBe(2);
      expect(kid.rollupCompletedProjectCount).toBe(1);
   });

   it('projeto vinculado à mãe E à filha conta uma vez no rollup', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const mother = await seedInitiative(db, 'mother', 'Mother');
      const child = await seedInitiative(db, 'child', 'Child');
      await updateInitiative(db, child.id, { parentId: mother.id });
      const p = await createProject(db, {
         name: 'Shared',
         statusId: 'proj-in-progress',
         ...BASE,
         teamId: 'CORE',
      });
      await updateInitiative(db, mother.id, { projectIds: [p.id] });
      await updateInitiative(db, child.id, { projectIds: [p.id] });

      expect((await getInitiative(db, mother.id))!.rollupProjectCount).toBe(1);
   });

   it('apagar a initiative reancora as filhas na avó', async () => {
      const db = await makeTestDb();
      const a = await seedInitiative(db, 'a', 'A');
      const b = await seedInitiative(db, 'b', 'B');
      const c = await seedInitiative(db, 'c', 'C');
      await updateInitiative(db, b.id, { parentId: a.id });
      await updateInitiative(db, c.id, { parentId: b.id });

      expect(await deleteInitiative(db, b.id)).toBe(true);
      expect((await getInitiative(db, c.id))!.parentId).toBe(a.id);
   });
});
