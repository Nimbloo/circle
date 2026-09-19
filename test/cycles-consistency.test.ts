import { describe, it, expect } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { cycle, cycleSnapshot, issue } from '@/db/schema';
import {
   createCycle,
   getCycle,
   listCyclesForTeams,
   snapshotCurrentCycles,
   updateCycle,
} from '@/lib/api/cycles';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { Cycle } from '@/data/cycles';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const base = { teamId: 'CORE', capacity: 0 };
   await db.insert(cycle).values([
      {
         id: 'c1',
         number: 1,
         name: 'C1',
         status: 'completed',
         startDate: '2026-01-01',
         endDate: '2026-01-14',
         ...base,
      },
      {
         id: 'c2',
         number: 2,
         name: 'C2',
         status: 'current',
         startDate: '2026-01-15',
         endDate: '2026-01-28',
         ...base,
      },
      {
         id: 'c3',
         number: 3,
         name: 'C3',
         status: 'upcoming',
         startDate: '2026-01-29',
         endDate: '2026-02-11',
         ...base,
      },
   ]);
   return db;
}

async function addIssue(
   db: Awaited<ReturnType<typeof setup>>,
   n: number,
   cycleId: string,
   statusId: string,
   estimate: number | null
) {
   await db.insert(issue).values({
      id: `i${n}`,
      identifier: `CORE-${n}`,
      teamId: 'CORE',
      title: `I${n}`,
      statusId,
      priorityId: 'low',
      rank: String(n),
      cycleId,
      estimate,
   });
}

describe('um ciclo current por time (#35)', () => {
   it('criar um segundo current responde 409', async () => {
      const db = await setup();
      await expect(
         createCycle(db, {
            teamId: 'CORE',
            name: 'X',
            startDate: '2026-03-01',
            endDate: '2026-03-14',
            status: 'current',
         })
      ).rejects.toMatchObject({ status: 409 });
   });

   it('promover outro ciclo a current responde 409; editar o próprio current passa', async () => {
      const db = await setup();
      await expect(updateCycle(db, 'c3', { status: 'current' })).rejects.toMatchObject({
         status: 409,
      });
      expect((await updateCycle(db, 'c2', { status: 'current', name: 'C2b' }))?.name).toBe('C2b');
      await updateCycle(db, 'c2', { status: 'completed' });
      expect((await updateCycle(db, 'c3', { status: 'current' }))?.status).toBe('current');
   });
});

describe('bootstrap de cycles agregado (#36)', () => {
   it('números agregados iguais aos do detalhe; burnup só do current', async () => {
      const db = await setup();
      await addIssue(db, 1, 'c1', 'done', 3);
      await addIssue(db, 2, 'c1', 'in-progress', null);
      await addIssue(db, 3, 'c2', 'to-do', 2);
      await addIssue(db, 4, 'c2', 'done', 5);
      await db.insert(cycleSnapshot).values([
         { cycleId: 'c1', date: '2026-01-01', scope: 2, started: 0, completed: 0 },
         { cycleId: 'c1', date: '2026-01-10', scope: 3, started: 0, completed: 0 },
      ]);

      const list = await listCyclesForTeams(db, ['CORE'], { burnup: 'current' });
      const byId = new Map(list.map((c) => [c.id, c]));
      expect(byId.get('c1')).toMatchObject({
         scope: 4,
         started: 1,
         completed: 3,
         scopeDelta: 100,
         burnup: null,
      });
      expect(byId.get('c2')).toMatchObject({ scope: 7, started: 0, completed: 5 });
      expect(byId.get('c2')!.burnup).not.toBeNull();

      const detail = (await getCycle(db, 'c1'))!;
      expect({ ...byId.get('c1'), burnup: detail.burnup }).toEqual(detail);
   });
});

describe('snapshot de cycle fora do GET (#36)', () => {
   it('getCycle não grava snapshot', async () => {
      const db = await setup();
      await addIssue(db, 1, 'c2', 'to-do', 1);
      await getCycle(db, 'c2', at('2026-01-20'));
      expect(await db.select().from(cycleSnapshot)).toHaveLength(0);
   });

   it('upsert sem mudança não reescreve a linha (IS DISTINCT FROM)', async () => {
      const db = await setup();
      await addIssue(db, 1, 'c2', 'to-do', 1);
      await snapshotCurrentCycles(db, 'CORE', at('2026-01-20'));
      const xmin = async () =>
         (
            await db.execute<{ xmin: string }>(
               sql`select xmin::text as xmin from cycle_snapshot where cycle_id = 'c2'`
            )
         ).rows[0].xmin;
      const before = await xmin();
      await snapshotCurrentCycles(db, 'CORE', at('2026-01-20'));
      expect(await xmin()).toBe(before);

      await db.update(issue).set({ statusId: 'done' }).where(eq(issue.id, 'i1'));
      await snapshotCurrentCycles(db, 'CORE', at('2026-01-20'));
      expect(await xmin()).not.toBe(before);
   });
});

describe('getUpcomingCycle (Pl baixa)', () => {
   it('devolve o upcoming mais próximo, não o mais distante', () => {
      const mk = (id: string, number: number, startDate: string) =>
         ({
            id,
            number,
            teamId: 'CORE',
            status: 'upcoming',
            startDate,
            endDate: startDate,
         }) as unknown as Cycle;
      // O bootstrap ordena por número desc: o mais distante vem primeiro.
      useWorkspaceStore.setState({
         cycles: [mk('far', 5, '2026-03-01'), mk('near', 4, '2026-02-01')],
      });
      expect(useWorkspaceStore.getState().getUpcomingCycle('CORE')?.id).toBe('near');
   });
});
