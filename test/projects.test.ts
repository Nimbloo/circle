import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue as issueT, projectUpdate, projectMilestone } from '@/db/schema';
import {
   createProject,
   listProjects,
   getProject,
   updateProject,
   deleteProject,
} from '@/lib/api/projects';
import {
   postProjectUpdate,
   addMilestone,
   listMilestones,
   reorderMilestones,
   deleteMilestone,
} from '@/lib/api/project-detail';

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

   it('deleting a project nullifies its issues and drops updates/milestones (FK safe)', async () => {
      const { db, lead } = await setup();
      const p = await createProject(db, { name: 'A', statusId: 'in-progress', ...base });
      const issueId = randomUUID();
      await db.insert(issueT).values({
         id: issueId,
         identifier: 'CORE-1',
         teamId: 'CORE',
         title: 'Bug',
         statusId: 'in-progress',
         priorityId: 'high',
         assigneeId: lead,
         createdById: lead,
         projectId: p.id,
         cycleId: null,
         rank: 'a0',
         createdAt: new Date(),
         updatedAt: new Date(),
      });
      await db.insert(projectUpdate).values({
         id: randomUUID(),
         projectId: p.id,
         authorId: lead,
         health: 'on-track',
         blocks: '[]',
         createdAt: new Date(),
      });
      await db.insert(projectMilestone).values({ id: randomUUID(), projectId: p.id, name: 'M1' });

      expect(await deleteProject(db, p.id)).toBe(true);
      expect(await getProject(db, p.id)).toBeNull();

      const issues = await db.select().from(issueT).where(eq(issueT.id, issueId));
      expect(issues).toHaveLength(1); // issue preservada
      expect(issues[0].projectId).toBeNull(); // vínculo nulificado

      expect(
         await db.select().from(projectUpdate).where(eq(projectUpdate.projectId, p.id))
      ).toHaveLength(0);
      expect(
         await db.select().from(projectMilestone).where(eq(projectMilestone.projectId, p.id))
      ).toHaveLength(0);
   });

   it('createProject rejeita FK de catálogo inválida com 400', async () => {
      const { db } = await setup();
      await expect(
         createProject(db, { name: 'X', statusId: 'nope', ...base })
      ).rejects.toMatchObject({ status: 400 });
   });

   it('milestones: add mantém ordem, reorder reposiciona, delete remove', async () => {
      const { db } = await setup();
      const p = await createProject(db, { name: 'P', statusId: 'in-progress', ...base });
      const a = await addMilestone(db, p.id, { name: 'Alpha' });
      const b = await addMilestone(db, p.id, { name: 'Beta' });
      const c = await addMilestone(db, p.id, { name: 'Gamma' });
      // ordem de inserção (position 0,1,2)
      expect((await listMilestones(db, p.id)).map((m) => m.name)).toEqual([
         'Alpha',
         'Beta',
         'Gamma',
      ]);

      // reorder: Gamma, Alpha, Beta
      await reorderMilestones(db, p.id, [c.id, a.id, b.id]);
      expect((await listMilestones(db, p.id)).map((m) => m.name)).toEqual([
         'Gamma',
         'Alpha',
         'Beta',
      ]);

      // delete do meio
      expect(await deleteMilestone(db, a.id)).toBe(true);
      expect((await listMilestones(db, p.id)).map((m) => m.name)).toEqual(['Gamma', 'Beta']);
   });

   it('um project update (check-in) dita o health corrente do projeto', async () => {
      const { db, lead } = await setup();
      const p = await createProject(db, { name: 'P', statusId: 'in-progress', ...base });
      expect(p.health.id).toBe('on-track');

      await postProjectUpdate(db, p.id, lead, { health: 'at-risk', blocks: [] });
      expect((await getProject(db, p.id))?.health.id).toBe('at-risk');

      await postProjectUpdate(db, p.id, lead, { health: 'off-track', blocks: [] });
      expect((await getProject(db, p.id))?.health.id).toBe('off-track');
   });
});
