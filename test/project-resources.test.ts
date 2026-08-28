import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { createProject } from '@/lib/api/projects';
import {
   addResource,
   updateResource,
   deleteResource,
   listResources,
} from '@/lib/api/project-detail';

const base = {
   statusId: 'proj-in-progress',
   priorityId: 'high',
   healthId: 'on-track',
   teamId: 'CORE' as const,
};

async function setupProject() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const proj = await createProject(db, { name: 'P', ...base });
   return { db, projectId: proj.id };
}

describe('project resources (add/update/delete)', () => {
   it('adiciona, lista, edita o label e remove', async () => {
      const { db, projectId } = await setupProject();
      const r = await addResource(db, projectId, {
         label: 'docs.google.com',
         url: 'https://docs.google.com/x',
      });
      expect((await listResources(db, projectId)).map((x) => x.label)).toContain('docs.google.com');

      expect(await updateResource(db, r.id, { label: 'Spec doc' })).toBe(true);
      const listed = await listResources(db, projectId);
      expect(listed.find((x) => x.id === r.id)?.label).toBe('Spec doc');

      expect(await deleteResource(db, r.id)).toBe(true);
      expect(await listResources(db, projectId)).toHaveLength(0);
   });

   it('updateResource: 404 (false) em id inexistente e rejeita label vazio', async () => {
      const { db, projectId } = await setupProject();
      const r = await addResource(db, projectId, { label: 'x', url: 'https://x.com' });
      expect(await updateResource(db, 'no-such', { label: 'y' })).toBe(false);
      await expect(updateResource(db, r.id, { label: '   ' })).rejects.toThrow(/label/);
   });
});
