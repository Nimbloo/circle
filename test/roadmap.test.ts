import { describe, expect, it } from 'vitest';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { initiative, project, projectMilestone } from '@/db/schema';
import { ApiError } from '@/lib/api/errors';
import { getRoadmap } from '@/lib/api/roadmap';
import { listDependencies, setDependencies } from '@/lib/api/project-dependencies';

/**
 * Roadmap (#102): agrupamento por initiative respeitando a hierarquia (#100),
 * dependências com guarda de ciclo e o cálculo de atraso das arestas.
 */

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

async function addInitiative(db: Db, id: string, name: string, parentId: string | null = null) {
   await db.insert(initiative).values({
      id,
      slug: id,
      name,
      status: 'active',
      priorityId: 'high',
      healthId: 'on-track',
      parentId,
      createdAt: new Date('2026-01-01T00:00:00Z'),
   });
}

async function addProject(
   db: Db,
   id: string,
   opts: {
      name?: string;
      teamId?: string;
      initiativeId?: string | null;
      statusId?: string;
      startDate?: string;
      targetDate?: string | null;
   } = {}
) {
   const now = new Date('2026-01-01T00:00:00Z');
   await db.insert(project).values({
      id,
      name: opts.name ?? id,
      statusId: opts.statusId ?? 'proj-in-progress',
      priorityId: 'high',
      healthId: 'on-track',
      teamId: opts.teamId ?? 'CORE',
      initiativeId: opts.initiativeId ?? null,
      startDate: opts.startDate ?? '2026-03-01',
      targetDate: opts.targetDate === undefined ? '2026-06-01' : opts.targetDate,
      createdAt: now,
      updatedAt: now,
   });
}

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

describe('agrupamento do roadmap (#102)', () => {
   it('agrupa por initiative em ordem de árvore e fecha com os projetos sem initiative', async () => {
      const db = await setup();
      await addInitiative(db, 'mother', 'Mother');
      await addInitiative(db, 'child', 'Child', 'mother');
      await addProject(db, 'p-mother', { initiativeId: 'mother' });
      await addProject(db, 'p-child', { initiativeId: 'child' });
      await addProject(db, 'p-loose');

      const roadmap = await getRoadmap(db, { now: at('2026-04-01') });

      expect(roadmap.groups.map((g) => [g.id, g.depth])).toEqual([
         ['mother', 0],
         ['child', 1],
         ['no-initiative', 0],
      ]);
      expect(roadmap.groups[0].projectIds).toEqual(['p-mother']);
      expect(roadmap.groups[2].projectIds).toEqual(['p-loose']);
   });

   it('o progresso da initiative-mãe agrega a subárvore', async () => {
      const db = await setup();
      await addInitiative(db, 'mother', 'Mother');
      await addInitiative(db, 'child', 'Child', 'mother');
      await addProject(db, 'p-mother', { initiativeId: 'mother' });
      await addProject(db, 'p-child-done', {
         initiativeId: 'child',
         statusId: 'proj-completed',
      });

      const roadmap = await getRoadmap(db, { now: at('2026-04-01') });
      const mother = roadmap.groups.find((g) => g.id === 'mother')!;
      const child = roadmap.groups.find((g) => g.id === 'child')!;

      expect(mother).toMatchObject({
         projectCount: 2,
         completedProjectCount: 1,
         percentComplete: 50,
      });
      expect(child).toMatchObject({ projectCount: 1, completedProjectCount: 1 });
   });

   it('initiative sem projeto visível não vira linha na tela', async () => {
      const db = await setup();
      await addInitiative(db, 'empty', 'Empty');
      await addProject(db, 'p1');

      const roadmap = await getRoadmap(db, { now: at('2026-04-01') });
      expect(roadmap.groups.map((g) => g.id)).toEqual(['no-initiative']);
   });

   it('includeCompleted=false esconde projetos concluídos e cancelados', async () => {
      const db = await setup();
      await addProject(db, 'p-open');
      await addProject(db, 'p-done', { statusId: 'proj-completed' });

      const all = await getRoadmap(db, { now: at('2026-04-01') });
      const open = await getRoadmap(db, { now: at('2026-04-01'), includeCompleted: false });

      expect(all.projects.map((p) => p.id).sort()).toEqual(['p-done', 'p-open']);
      expect(open.projects.map((p) => p.id)).toEqual(['p-open']);
   });

   it('escopo de Guest limita os projetos e os grupos', async () => {
      const db = await setup();
      await seedTeam(db, 'WEB', 'Web');
      await seedUser(db, {
         name: 'Guest',
         email: 'guest@nimbloo.ai',
         role: 'Guest',
         teamIds: ['CORE'],
      });
      await addInitiative(db, 'ini', 'Initiative');
      await addProject(db, 'p-core', { initiativeId: 'ini' });
      await addProject(db, 'p-web', { teamId: 'WEB', initiativeId: 'ini' });

      const scoped = await getRoadmap(db, { teamIds: ['CORE'], now: at('2026-04-01') });
      expect(scoped.projects.map((p) => p.id)).toEqual(['p-core']);
      expect(scoped.groups[0]).toMatchObject({ id: 'ini', projectCount: 1 });
   });

   it('marcos com data entram na resposta ordenados; sem data ficam de fora', async () => {
      const db = await setup();
      await addProject(db, 'p1');
      await db.insert(projectMilestone).values([
         { id: 'm2', projectId: 'p1', name: 'Beta', targetDate: '2026-05-01', completed: false },
         { id: 'm1', projectId: 'p1', name: 'Alpha', targetDate: '2026-04-01', completed: true },
         { id: 'm3', projectId: 'p1', name: 'Sem data', targetDate: null, completed: false },
      ]);

      const roadmap = await getRoadmap(db, { now: at('2026-04-15') });
      expect(roadmap.milestones.map((m) => m.name)).toEqual(['Alpha', 'Beta']);
      expect(roadmap.milestones[0].completed).toBe(true);
   });
});

describe('dependências entre projetos (#102)', () => {
   it('grava e lê as dependências do projeto', async () => {
      const db = await setup();
      await addProject(db, 'a', { name: 'A' });
      await addProject(db, 'b', { name: 'B' });
      await addProject(db, 'c', { name: 'C' });

      expect(await setDependencies(db, 'a', ['c', 'b'])).toEqual(['b', 'c']);
      expect(await listDependencies(db, 'a')).toEqual(['b', 'c']);

      // A gravação SUBSTITUI o conjunto anterior.
      expect(await setDependencies(db, 'a', ['b'])).toEqual(['b']);
   });

   it('recusa auto-referência e ciclo com 400', async () => {
      const db = await setup();
      await addProject(db, 'a');
      await addProject(db, 'b');
      await addProject(db, 'c');
      await setDependencies(db, 'b', ['a']);
      await setDependencies(db, 'c', ['b']);

      await expect(setDependencies(db, 'a', ['a'])).rejects.toMatchObject({ status: 400 });
      // a → c fecharia o ciclo a → c → b → a.
      await expect(setDependencies(db, 'a', ['c'])).rejects.toBeInstanceOf(ApiError);
      await expect(setDependencies(db, 'a', ['c'])).rejects.toMatchObject({ status: 400 });
      // Nada foi gravado na tentativa recusada.
      expect(await listDependencies(db, 'a')).toEqual([]);
   });

   it('recusa alvo inexistente e projeto inexistente', async () => {
      const db = await setup();
      await addProject(db, 'a');
      await expect(setDependencies(db, 'a', ['nope'])).rejects.toMatchObject({ status: 400 });
      await expect(setDependencies(db, 'nope', [])).rejects.toMatchObject({ status: 404 });
   });

   it('marca atraso por sobreposição e por target vencido', async () => {
      const db = await setup();
      // `late` só quando a dependência termina depois do início de quem depende dela.
      await addProject(db, 'early', { targetDate: '2026-02-01' });
      await addProject(db, 'overlapping', { targetDate: '2026-05-01' });
      await addProject(db, 'dependent', { startDate: '2026-03-01', targetDate: '2026-08-01' });

      await setDependencies(db, 'dependent', ['early', 'overlapping']);
      const roadmap = await getRoadmap(db, { now: at('2026-03-15') });
      const byDep = new Map(roadmap.dependencies.map((d) => [d.dependsOnId, d]));

      expect(byDep.get('overlapping')).toMatchObject({ late: true, reason: 'overlap' });
      // `early` já venceu (target 2026-02-01 < hoje) e não está concluído → overdue.
      expect(byDep.get('early')).toMatchObject({ late: true, reason: 'overdue' });
   });

   it('dependência concluída não conta como atraso', async () => {
      const db = await setup();
      await addProject(db, 'done', { targetDate: '2026-05-01', statusId: 'proj-completed' });
      await addProject(db, 'dependent', { startDate: '2026-03-01' });
      await setDependencies(db, 'dependent', ['done']);

      const roadmap = await getRoadmap(db, { now: at('2026-06-01') });
      expect(roadmap.dependencies).toEqual([
         { projectId: 'dependent', dependsOnId: 'done', late: false, reason: null },
      ]);
   });

   it('aresta com uma ponta fora do escopo não é desenhada', async () => {
      const db = await setup();
      await seedTeam(db, 'WEB', 'Web');
      await addProject(db, 'core');
      await addProject(db, 'web', { teamId: 'WEB' });
      await setDependencies(db, 'core', ['web']);

      const roadmap = await getRoadmap(db, { teamIds: ['CORE'], now: at('2026-04-01') });
      expect(roadmap.dependencies).toEqual([]);
   });
});
