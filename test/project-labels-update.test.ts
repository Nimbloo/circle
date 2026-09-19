import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { createProject, updateProject } from '@/lib/api/projects';

const base = {
   statusId: 'proj-in-progress',
   priorityId: 'high',
   healthId: 'on-track',
   teamId: 'CORE' as const,
};

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

/** pl#2: o sidecar edita as labels do projeto — o PATCH aceita `labelIds` (substitui o conjunto). */
describe('updateProject — labelIds', () => {
   it('substitui o conjunto de labels do projeto', async () => {
      const db = await setup();
      const p = await createProject(db, { name: 'A', ...base, labelIds: ['ui'] });

      const upd = await updateProject(db, p.id, { labelIds: ['bug'] });
      expect(upd?.labels.map((l) => l.id)).toEqual(['bug']);

      const cleared = await updateProject(db, p.id, { labelIds: [] });
      expect(cleared?.labels).toEqual([]);
   });

   it('label inexistente é recusada com 400 sem mexer nas atuais', async () => {
      const db = await setup();
      const p = await createProject(db, { name: 'A', ...base, labelIds: ['ui'] });

      await expect(updateProject(db, p.id, { labelIds: ['nope'] })).rejects.toMatchObject({
         status: 400,
      });
      const { getProject } = await import('@/lib/api/projects');
      expect((await getProject(db, p.id))?.labels.map((l) => l.id)).toEqual(['ui']);
   });

   it('patch sem labelIds preserva as labels', async () => {
      const db = await setup();
      const p = await createProject(db, { name: 'A', ...base, labelIds: ['ui', 'bug'] });
      const upd = await updateProject(db, p.id, { name: 'B' });
      expect(upd?.labels.map((l) => l.id).sort()).toEqual(['bug', 'ui']);
   });
});
