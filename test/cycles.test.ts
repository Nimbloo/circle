import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { cycle } from '@/db/schema';
import { createIssue } from '@/lib/api/issues';
import { listCyclesByTeam, getCycle, getCycleByStatus } from '@/lib/api/cycles';

const ME = 'dev@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await db
      .insert(cycle)
      .values({
         id: 'c1',
         number: 1,
         name: 'Cycle 1',
         teamId: 'CORE',
         status: 'current',
         startDate: '2026-01-01',
         endDate: '2026-01-14',
         capacity: 80,
      });
   await db
      .insert(cycle)
      .values({
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

   it('current cycle has a burnup, upcoming does not', async () => {
      const db = await setup();
      expect((await getCycle(db, 'c1'))?.burnup).not.toBeNull();
      expect((await getCycle(db, 'c2'))?.burnup).toBeNull();
   });

   it('resolves current and upcoming cycles by status', async () => {
      const db = await setup();
      expect((await getCycleByStatus(db, 'CORE', 'current'))?.id).toBe('c1');
      expect((await getCycleByStatus(db, 'CORE', 'upcoming'))?.id).toBe('c2');
   });
});
