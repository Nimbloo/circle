import { describe, expect, it } from 'vitest';
import { asc } from 'drizzle-orm';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { initiative, issue, project, projectSnapshot } from '@/db/schema';
import {
   aggregateSnapshots,
   getProjectSnapshots,
   snapshotProjects,
} from '@/lib/api/project-snapshots';
import { getInitiativeSnapshots } from '@/lib/api/roadmap';

/**
 * Snapshots do projeto (#102): sem job, o dia é gravado (upsert idempotente) no boot,
 * no GET do roadmap e no GET da própria série; a initiative soma os projetos da
 * subárvore, segurando o último valor conhecido nos dias sem registro.
 */

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

async function addProject(db: Db, id: string, initiativeId: string | null = null) {
   const now = new Date('2026-01-01T00:00:00Z');
   await db.insert(project).values({
      id,
      name: id,
      statusId: 'proj-in-progress',
      priorityId: 'high',
      healthId: 'on-track',
      teamId: 'CORE',
      initiativeId,
      startDate: '2026-01-01',
      targetDate: '2026-06-01',
      createdAt: now,
      updatedAt: now,
   });
}

let issueSeq = 0;
async function addIssue(db: Db, projectId: string, statusId: string) {
   issueSeq += 1;
   await db.insert(issue).values({
      id: `i${issueSeq}`,
      identifier: `CORE-${issueSeq}`,
      teamId: 'CORE',
      title: `Issue ${issueSeq}`,
      statusId,
      priorityId: 'low',
      rank: String(issueSeq),
      projectId,
   });
}

const rowsOf = (db: Db) => db.select().from(projectSnapshot).orderBy(asc(projectSnapshot.date));

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

describe('snapshot diário do projeto (#102)', () => {
   it('grava uma linha por dia e reescreve a do mesmo dia (idempotente)', async () => {
      const db = await setup();
      await addProject(db, 'p1');
      await addIssue(db, 'p1', 'to-do');

      await snapshotProjects(db, ['p1'], at('2026-03-01'));
      await addIssue(db, 'p1', 'done');
      await snapshotProjects(db, ['p1'], at('2026-03-01'));

      const rows = await rowsOf(db);
      expect(rows).toEqual([
         { projectId: 'p1', date: '2026-03-01', scope: 2, started: 0, completed: 1 },
      ]);

      await snapshotProjects(db, ['p1'], at('2026-03-02'));
      expect(await rowsOf(db)).toHaveLength(2);
   });

   it('conta started e completed pela categoria do status da issue', async () => {
      const db = await setup();
      await addProject(db, 'p1');
      await addIssue(db, 'p1', 'in-progress');
      await addIssue(db, 'p1', 'done');
      await addIssue(db, 'p1', 'backlog');

      await snapshotProjects(db, ['p1'], at('2026-03-01'));
      expect(await rowsOf(db)).toEqual([
         { projectId: 'p1', date: '2026-03-01', scope: 3, started: 1, completed: 1 },
      ]);
   });

   it('projeto sem issue nenhuma não gera linha (série vazia é honesta)', async () => {
      const db = await setup();
      await addProject(db, 'p1');
      await snapshotProjects(db, ['p1'], at('2026-03-01'));
      expect(await rowsOf(db)).toEqual([]);
   });

   it('o GET da série grava o dia corrente antes de ler', async () => {
      const db = await setup();
      await addProject(db, 'p1');
      await addIssue(db, 'p1', 'done');

      const points = await getProjectSnapshots(db, 'p1', at('2026-03-05'));
      expect(points).toEqual([{ date: '2026-03-05', scope: 1, started: 0, completed: 1 }]);
   });
});

describe('agregação por initiative (#102)', () => {
   it('soma os dias segurando o último valor conhecido de cada projeto', () => {
      const a = [
         { date: '2026-03-01', scope: 10, started: 2, completed: 1 },
         { date: '2026-03-03', scope: 12, started: 3, completed: 4 },
      ];
      const b = [{ date: '2026-03-02', scope: 5, started: 1, completed: 0 }];

      expect(aggregateSnapshots([a, b])).toEqual([
         // 03-01: só `a` tem história.
         { date: '2026-03-01', scope: 10, started: 2, completed: 1 },
         // 03-02: `a` segura o valor de 03-01 e entra `b`.
         { date: '2026-03-02', scope: 15, started: 3, completed: 1 },
         // 03-03: `a` atualiza, `b` segura.
         { date: '2026-03-03', scope: 17, started: 4, completed: 4 },
      ]);
      expect(aggregateSnapshots([])).toEqual([]);
   });

   it('a initiative agrega os projetos da subárvore', async () => {
      const db = await setup();
      const now = new Date('2026-01-01T00:00:00Z');
      await db.insert(initiative).values([
         {
            id: 'mother',
            slug: 'mother',
            name: 'Mother',
            status: 'active',
            priorityId: 'high',
            healthId: 'on-track',
            createdAt: now,
         },
         {
            id: 'child',
            slug: 'child',
            name: 'Child',
            status: 'active',
            priorityId: 'high',
            healthId: 'on-track',
            parentId: 'mother',
            createdAt: now,
         },
      ]);
      await addProject(db, 'p-mother', 'mother');
      await addProject(db, 'p-child', 'child');
      await addIssue(db, 'p-mother', 'done');
      await addIssue(db, 'p-child', 'in-progress');
      await addIssue(db, 'p-child', 'to-do');

      const series = await getInitiativeSnapshots(db, 'mother', { now: at('2026-03-10') });
      expect(series).toEqual([{ date: '2026-03-10', scope: 3, started: 1, completed: 1 }]);

      // A filha sozinha vê só os próprios projetos.
      expect(await getInitiativeSnapshots(db, 'child', { now: at('2026-03-10') })).toEqual([
         { date: '2026-03-10', scope: 2, started: 1, completed: 0 },
      ]);
   });

   it('o escopo de times filtra os projetos agregados', async () => {
      const db = await setup();
      await seedTeam(db, 'WEB', 'Web');
      await db.insert(initiative).values({
         id: 'ini',
         slug: 'ini',
         name: 'Initiative',
         status: 'active',
         priorityId: 'high',
         healthId: 'on-track',
         createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      // O projeto é do CORE; o escopo pedido é o WEB → nada agregado.
      await addProject(db, 'p-core', 'ini');
      await addIssue(db, 'p-core', 'done');

      const series = await getInitiativeSnapshots(db, 'ini', {
         teamIds: ['WEB'],
         now: at('2026-03-10'),
      });
      expect(series).toEqual([]);
   });
});
