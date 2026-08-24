import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { cycle } from '@/db/schema';
import { createIssue, getIssue } from '@/lib/api/issues';
import {
   listCyclesByTeam,
   getCycle,
   createCycle,
   updateCycle,
   deleteCycle,
} from '@/lib/api/cycles';
import { ApiError } from '@/lib/api/errors';

const ME = 'dev@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await db.insert(cycle).values({
      id: 'c1',
      number: 1,
      name: 'Cycle 1',
      teamId: 'CORE',
      status: 'current',
      startDate: '2026-01-01',
      endDate: '2026-01-14',
      capacity: 80,
   });
   await db.insert(cycle).values({
      id: 'c2',
      number: 2,
      name: 'Cycle 2',
      teamId: 'CORE',
      status: 'upcoming',
      startDate: '2026-01-15',
      endDate: '2026-01-28',
      capacity: 80,
   });
   return db;
}

describe('cycles', () => {
   it('computes scope/started/completed from real issues', async () => {
      const db = await setup();
      await createIssue(
         db,
         { teamId: 'CORE', title: 'A', statusId: 'in-progress', priorityId: 'low', cycleId: 'c1' },
         ME
      ); // started
      await createIssue(
         db,
         { teamId: 'CORE', title: 'B', statusId: 'done', priorityId: 'low', cycleId: 'c1' },
         ME
      ); // completed
      await createIssue(
         db,
         { teamId: 'CORE', title: 'C', statusId: 'to-do', priorityId: 'low', cycleId: 'c1' },
         ME
      ); // unstarted

      const cycles = await listCyclesByTeam(db, 'CORE');
      const c1 = cycles.find((c) => c.id === 'c1')!;
      expect(c1.scope).toBe(3);
      expect(c1.started).toBe(1);
      expect(c1.completed).toBe(1);
      // ordenado por número desc
      expect(cycles[0].number).toBe(2);
   });

   it('completed cycle has a burnup, upcoming does not (status derivado das datas)', async () => {
      const db = await setup();
      // c1 tem datas no passado → status derivado 'completed' → tem burnup.
      expect((await getCycle(db, 'c1'))?.status).toBe('completed');
      expect((await getCycle(db, 'c1'))?.burnup).not.toBeNull();
      // um ciclo com datas no futuro → 'upcoming' → sem burnup.
      const future = await createCycle(db, {
         teamId: 'CORE',
         name: 'Future',
         startDate: '2099-01-05',
         endDate: '2099-01-18',
      });
      expect((await getCycle(db, future.id))?.status).toBe('upcoming');
      expect((await getCycle(db, future.id))?.burnup).toBeNull();
   });

   it('creates a cycle auto-numbering by team; status é derivado das datas', async () => {
      const db = await setup(); // já tem c1 (n=1) e c2 (n=2)
      const created = await createCycle(db, {
         teamId: 'CORE',
         name: 'Cycle 3',
         startDate: '2099-01-29',
         endDate: '2099-02-11',
      });
      expect(created.number).toBe(3);
      expect(created.status).toBe('upcoming'); // datas no futuro
      expect(created.capacity).toBe(0);
      expect(created.scope).toBe(0);

      const cycles = await listCyclesByTeam(db, 'CORE');
      expect(cycles[0].number).toBe(3); // ordenado por número desc
   });

   it('rejects create for a missing team', async () => {
      const db = await setup();
      await expect(
         createCycle(db, {
            teamId: 'NOPE',
            name: 'X',
            startDate: '2026-01-01',
            endDate: '2026-01-14',
         })
      ).rejects.toThrow(ApiError);
   });

   it('updates dates (status segue as datas — derivado)', async () => {
      const db = await setup();
      const updated = await updateCycle(db, 'c2', {
         startDate: '2099-02-01',
         endDate: '2099-02-14',
      });
      expect(updated?.startDate).toBe('2099-02-01');
      expect(updated?.endDate).toBe('2099-02-14');
      expect(updated?.status).toBe('upcoming'); // datas no futuro → derivado 'upcoming'
      expect(await updateCycle(db, 'missing', { name: 'x' })).toBeNull();
   });

   it('deletes a cycle, disassociating its issues, and removes it from the list', async () => {
      const db = await setup();
      const issue = await createIssue(
         db,
         { teamId: 'CORE', title: 'A', statusId: 'in-progress', priorityId: 'low', cycleId: 'c1' },
         ME
      );

      const removed = await deleteCycle(db, 'c1');
      expect(removed).toBe(true);
      expect(await getCycle(db, 'c1')).toBeNull();
      // a issue sobrevive, sem ciclo
      expect((await getIssue(db, issue.id))?.cycleId).toBe('');
      // sumiu da lista do time
      expect((await listCyclesByTeam(db, 'CORE')).some((c) => c.id === 'c1')).toBe(false);
      // deletar de novo = false
      expect(await deleteCycle(db, 'c1')).toBe(false);
   });
});
