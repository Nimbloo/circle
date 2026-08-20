import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import {
   createProject,
   listProjects,
   getProject,
   updateProject,
   deleteProject,
} from '@/lib/api/projects';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const lead = await seedUser(db, { name: 'Lia', email: 'lia@nimbloo.ai', teamIds: ['CORE'] });
   return { db, lead };
}

const base = { priorityId: 'high', healthId: 'on-track', teamId: 'CORE' as const };

describe('projects', () => {
   it('creates a project with nested status/priority/health/lead', async () => {
      const { db, lead } = await setup();
      const dto = await createProject(db, {
         name: 'Core Components',
         statusId: 'in-progress',
         leadId: lead,
         ...base,
         labelIds: ['ui'],
      });
      expect(dto.name).toBe('Core Components');
      expect(dto.status.id).toBe('in-progress');
      expect(dto.health.id).toBe('on-track');
      expect(dto.lead?.email).toBe('lia@nimbloo.ai');
      expect(dto.labels.map((l) => l.id)).toEqual(['ui']);
      expect(dto.issueCount).toBe(0);
   });

   it('active tab excludes completed/canceled projects', async () => {
      const { db } = await setup();
      await createProject(db, { name: 'Ativo', statusId: 'in-progress', ...base }); // started
      await createProject(db, { name: 'Fechado', statusId: 'done', ...base }); // completed
      expect(await listProjects(db, { tab: 'all' })).toHaveLength(2);
      const active = await listProjects(db, { tab: 'active' });
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Ativo');
   });

   it('filters by health and priority', async () => {
      const { db } = await setup();
      await createProject(db, {
         name: 'A',
         statusId: 'in-progress',
         priorityId: 'urgent',
         healthId: 'at-risk',
         teamId: 'CORE',
      });
      await createProject(db, {
         name: 'B',
         statusId: 'in-progress',
         priorityId: 'low',
         healthId: 'on-track',
         teamId: 'CORE',
      });
      expect(await listProjects(db, { health: ['at-risk'] })).toHaveLength(1);
      expect(await listProjects(db, { priority: ['low'] })).toHaveLength(1);
   });

   it('updating health stamps healthUpdatedAt', async () => {
      const { db } = await setup();
      const p = await createProject(db, { name: 'A', statusId: 'in-progress', ...base });
      expect(p.healthUpdatedAt).toBeNull();
      const upd = await updateProject(db, p.id, { healthId: 'off-track' });
      expect(upd?.health.id).toBe('off-track');
      expect(upd?.healthUpdatedAt).not.toBeNull();
   });

   it('gets and deletes a project', async () => {
      const { db } = await setup();
      const p = await createProject(db, {
         name: 'A',
         statusId: 'in-progress',
         ...base,
         labelIds: ['bug'],
      });
      expect((await getProject(db, p.id))?.name).toBe('A');
      expect(await deleteProject(db, p.id)).toBe(true);
      expect(await getProject(db, p.id)).toBeNull();
   });
});
