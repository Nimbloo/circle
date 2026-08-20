import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { createProject } from '@/lib/api/projects';
import {
   createInitiative,
   listInitiatives,
   getInitiative,
   updateInitiative,
   deleteInitiative,
} from '@/lib/api/initiatives';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

const baseProj = { priorityId: 'high', healthId: 'on-track', teamId: 'CORE' as const };

describe('initiatives', () => {
   it('creates an initiative with nested priority/health and project counts', async () => {
      const db = await setup();
      const p1 = await createProject(db, { name: 'P1', statusId: 'done', ...baseProj }); // completed
      const p2 = await createProject(db, { name: 'P2', statusId: 'in-progress', ...baseProj }); // não

      const init = await createInitiative(db, {
         slug: 'platform',
         name: 'Platform',
         priorityId: 'urgent',
         healthId: 'at-risk',
         projectIds: [p1.id, p2.id],
      });
      expect(init.priority.id).toBe('urgent');
      expect(init.health.id).toBe('at-risk');
      expect(init.projectCount).toBe(2);
      expect(init.completedProjectCount).toBe(1); // só p1 (done)
   });

   it('filters by status and priority', async () => {
      const db = await setup();
      await createInitiative(db, {
         slug: 'a',
         name: 'A',
         priorityId: 'urgent',
         healthId: 'on-track',
         status: 'active',
      });
      await createInitiative(db, {
         slug: 'b',
         name: 'B',
         priorityId: 'low',
         healthId: 'on-track',
         status: 'planned',
      });
      expect(await listInitiatives(db, { status: ['active'] })).toHaveLength(1);
      expect(await listInitiatives(db, { priority: ['low'] })).toHaveLength(1);
   });

   it('updates and deletes', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'a',
         name: 'A',
         priorityId: 'urgent',
         healthId: 'on-track',
      });
      const upd = await updateInitiative(db, init.id, { status: 'completed', name: 'A2' });
      expect(upd?.status).toBe('completed');
      expect(upd?.name).toBe('A2');
      expect(await deleteInitiative(db, init.id)).toBe(true);
      expect(await getInitiative(db, init.id)).toBeNull();
   });
});
