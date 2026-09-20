import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { projectSnapshot } from '@/db/schema';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { createProject, getProject, updateProject } from '@/lib/api/projects';
import { createInitiative, getInitiative, updateInitiative } from '@/lib/api/initiatives';
import { getRoadmap } from '@/lib/api/roadmap';
import { createIssue } from '@/lib/api/issues';
import { isProjectCompleted } from '@/lib/project-completion';

const base = { priorityId: 'high', healthId: 'on-track', teamId: 'CORE' as const };
const initBase = { priorityId: 'high', healthId: 'on-track' };

let db: Db;
let events: CircleEvent[];
let stop: () => void;

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   events = [];
   stop = subscribe((e) => events.push(e));
});
afterEach(() => stop());

const idsOf = (entity: string) =>
   events.filter((e) => e.entity === entity && e.action === 'updated').map((e) => e.id);

describe('vínculo projeto↔initiative (#37)', () => {
   it('adicionar projeto a outra initiative remove o vínculo antigo e publica as duas', async () => {
      const p = await createProject(db, { name: 'P', statusId: 'proj-in-progress', ...base });
      const a = await createInitiative(db, {
         slug: 'a',
         name: 'A',
         ...initBase,
         projectIds: [p.id],
      });
      const b = await createInitiative(db, { slug: 'b', name: 'B', ...initBase });
      events.length = 0;

      await updateInitiative(db, b.id, { projectIds: [p.id] });

      expect((await getInitiative(db, a.id))!.projectIds).toEqual([]);
      expect((await getInitiative(db, b.id))!.projectIds).toEqual([p.id]);
      expect((await getProject(db, p.id))!.initiativeId).toBe(b.id);
      expect(idsOf('initiative')).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(idsOf('project')).toContain(p.id);
   });

   it('criar initiative com projeto já vinculado também tira o projeto da antiga', async () => {
      const p = await createProject(db, { name: 'P', statusId: 'proj-in-progress', ...base });
      const a = await createInitiative(db, {
         slug: 'a',
         name: 'A',
         ...initBase,
         projectIds: [p.id],
      });
      events.length = 0;

      const b = await createInitiative(db, {
         slug: 'b',
         name: 'B',
         ...initBase,
         projectIds: [p.id],
      });

      expect((await getInitiative(db, a.id))!.projectIds).toEqual([]);
      expect((await getInitiative(db, b.id))!.projectCount).toBe(1);
      expect(idsOf('initiative')).toContain(a.id);
   });
});

describe('definição única de projeto concluído (#41)', () => {
   it('isProjectCompleted: categoria completed ou 100%; cancelado não', () => {
      expect(isProjectCompleted({ status: { category: 'completed' }, percentComplete: 0 })).toBe(
         true
      );
      expect(isProjectCompleted({ status: { category: 'started' }, percentComplete: 100 })).toBe(
         true
      );
      expect(isProjectCompleted({ status: { category: 'canceled' }, percentComplete: 10 })).toBe(
         false
      );
   });

   it('roadmap e initiative contam os mesmos concluídos', async () => {
      const done = await createProject(db, { name: 'Done', statusId: 'proj-completed', ...base });
      const full = await createProject(db, {
         name: 'Full',
         statusId: 'proj-in-progress',
         percentComplete: 100,
         ...base,
      });
      const canceled = await createProject(db, { name: 'X', statusId: 'proj-canceled', ...base });
      const canceled2 = await createProject(db, { name: 'Y', statusId: 'proj-canceled', ...base });
      const init = await createInitiative(db, {
         slug: 'i',
         name: 'I',
         ...initBase,
         projectIds: [done.id, full.id, canceled.id, canceled2.id],
      });

      const dto = (await getInitiative(db, init.id))!;
      const group = (await getRoadmap(db)).groups.find((g) => g.id === init.id)!;
      expect(dto.completedProjectCount).toBe(2);
      expect(group.completedProjectCount).toBe(dto.completedProjectCount);
   });

   it('mudar o status de um projeto publica a initiative e as ancestrais (rollup)', async () => {
      const p = await createProject(db, { name: 'P', statusId: 'proj-in-progress', ...base });
      const mother = await createInitiative(db, { slug: 'm', name: 'M', ...initBase });
      const child = await createInitiative(db, {
         slug: 'c',
         name: 'C',
         ...initBase,
         parentId: mother.id,
         projectIds: [p.id],
      });
      events.length = 0;

      await updateProject(db, p.id, { statusId: 'proj-completed' });

      expect(idsOf('initiative')).toEqual(expect.arrayContaining([child.id, mother.id]));
   });

   it('trocar a initiative do projeto publica a antiga e a nova', async () => {
      const p = await createProject(db, { name: 'P', statusId: 'proj-in-progress', ...base });
      const a = await createInitiative(db, {
         slug: 'a',
         name: 'A',
         ...initBase,
         projectIds: [p.id],
      });
      const b = await createInitiative(db, { slug: 'b', name: 'B', ...initBase });
      events.length = 0;

      await updateProject(db, p.id, { initiativeId: b.id });

      expect(idsOf('initiative')).toEqual(expect.arrayContaining([a.id, b.id]));
   });
});

describe('roadmap sem escrita no GET (#40)', () => {
   it('getRoadmap não grava snapshot', async () => {
      const p = await createProject(db, { name: 'P', statusId: 'proj-in-progress', ...base });
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
      await createIssue(
         db,
         { teamId: 'CORE', title: 'x', statusId: 'to-do', priorityId: 'high', projectId: p.id },
         'ana@nimbloo.ai'
      );

      await getRoadmap(db);

      expect(await db.select().from(projectSnapshot)).toEqual([]);
   });
});
