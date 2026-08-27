import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { createProject, getProject, updateProject } from '@/lib/api/projects';
import {
   createInitiative,
   listInitiatives,
   getInitiative,
   updateInitiative,
   deleteInitiative,
   postInitiativeUpdate,
   listInitiativeUpdates,
} from '@/lib/api/initiatives';
import { seedUser } from './helpers/fixtures';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

const baseProj = { priorityId: 'high', healthId: 'on-track', teamId: 'CORE' as const };

describe('initiatives', () => {
   it('um initiative update (check-in) dita o health corrente + aparece no feed', async () => {
      const db = await setup();
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai' });
      const init = await createInitiative(db, {
         slug: 'plat',
         name: 'Plat',
         priorityId: 'high',
         healthId: 'on-track',
      });
      expect(init.health.id).toBe('on-track');

      await postInitiativeUpdate(db, init.id, 'ana@nimbloo.ai', { health: 'off-track', blocks: [] });
      expect((await getInitiative(db, init.id))?.health.id).toBe('off-track');

      const feed = await listInitiativeUpdates(db, init.id);
      expect(feed).toHaveLength(1);
      expect(feed[0].health).toBe('off-track');
      expect(feed[0].author?.email).toBe('ana@nimbloo.ai');
   });

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

   it('createProject com initiativeId aparece no projectCount da initiative (sincroniza o vínculo)', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'platform',
         name: 'Platform',
         priorityId: 'urgent',
         healthId: 'on-track',
      });
      await createProject(db, {
         name: 'P',
         statusId: 'in-progress',
         ...baseProj,
         initiativeId: init.id,
      });
      const got = await getInitiative(db, init.id);
      expect(got?.projectCount).toBe(1);
   });

   it('updateProject setando initiativeId sincroniza os dois lados', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'platform',
         name: 'Platform',
         priorityId: 'urgent',
         healthId: 'on-track',
      });
      const p = await createProject(db, { name: 'P', statusId: 'in-progress', ...baseProj });
      expect((await getInitiative(db, init.id))?.projectCount).toBe(0);

      await updateProject(db, p.id, { initiativeId: init.id });
      expect((await getInitiative(db, init.id))?.projectCount).toBe(1);

      // desvincular limpa o join também
      await updateProject(db, p.id, { initiativeId: null });
      expect((await getInitiative(db, init.id))?.projectCount).toBe(0);
   });

   it('updateInitiative com projectIds sincroniza project.initiativeId dos afetados', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'platform',
         name: 'Platform',
         priorityId: 'urgent',
         healthId: 'on-track',
      });
      const p1 = await createProject(db, { name: 'P1', statusId: 'in-progress', ...baseProj });
      const p2 = await createProject(db, { name: 'P2', statusId: 'in-progress', ...baseProj });

      await updateInitiative(db, init.id, { projectIds: [p1.id, p2.id] });
      expect((await getProject(db, p1.id))?.initiativeId).toBe(init.id);
      expect((await getProject(db, p2.id))?.initiativeId).toBe(init.id);
      expect((await getInitiative(db, init.id))?.projectCount).toBe(2);

      // remover p2 do conjunto limpa a back-reference dele
      await updateInitiative(db, init.id, { projectIds: [p1.id] });
      expect((await getProject(db, p1.id))?.initiativeId).toBe(init.id);
      expect((await getProject(db, p2.id))?.initiativeId).toBeNull();
      expect((await getInitiative(db, init.id))?.projectCount).toBe(1);
   });

   it('deleting an initiative nullifies project.initiativeId and clears links (FK safe)', async () => {
      const db = await setup();
      const init = await createInitiative(db, {
         slug: 'platform',
         name: 'Platform',
         priorityId: 'high',
         healthId: 'on-track',
      });
      const p = await createProject(db, {
         name: 'P',
         statusId: 'in-progress',
         ...baseProj,
         initiativeId: init.id,
      });

      expect(await deleteInitiative(db, init.id)).toBe(true);
      expect(await getInitiative(db, init.id)).toBeNull();

      const proj = await getProject(db, p.id);
      expect(proj).not.toBeNull(); // projeto preservado
      expect(proj?.initiativeId).toBeNull(); // vínculo direto nulificado
   });
});
