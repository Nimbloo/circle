import { describe, it, expect } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { cycle, cycleSnapshot, issue } from '@/db/schema';
import { getCycle, rolloverCyclesForTeam } from '@/lib/api/cycles';

/**
 * Snapshots do cycle (#24): sem job, o dia é gravado (upsert idempotente) no rollover e
 * no GET do detalhe; `scopeDelta` e o burn-up saem daí quando há >= 2 pontos, senão o
 * burn-up cai no sintético (started/completed de issue.startedAt/completedAt, scope plano).
 */

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

async function setup(status: 'current' | 'completed', end = '2026-01-14') {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await db.insert(cycle).values({
      id: 'c1',
      number: 1,
      name: 'Cycle 1',
      teamId: 'CORE',
      status,
      startDate: '2026-01-01',
      endDate: end,
      capacity: 0,
   });
   return db;
}

async function addIssue(
   db: Awaited<ReturnType<typeof setup>>,
   n: number,
   statusId: string,
   estimate: number
) {
   await db.insert(issue).values({
      id: `i${n}`,
      identifier: `CORE-${n}`,
      teamId: 'CORE',
      title: `I${n}`,
      statusId,
      priorityId: 'low',
      rank: String(n),
      cycleId: 'c1',
      estimate,
   });
}

const snapshotsOf = (db: Awaited<ReturnType<typeof setup>>) =>
   db
      .select()
      .from(cycleSnapshot)
      .where(eq(cycleSnapshot.cycleId, 'c1'))
      .orderBy(asc(cycleSnapshot.date));

describe('snapshots do cycle (#24)', () => {
   it('GET do detalhe grava o dia uma vez e atualiza no mesmo dia (idempotente)', async () => {
      const db = await setup('current');
      await addIssue(db, 1, 'to-do', 3);

      await getCycle(db, 'c1', at('2026-01-05'));
      await addIssue(db, 2, 'done', 2);
      await getCycle(db, 'c1', at('2026-01-05'));

      const rows = await snapshotsOf(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ date: '2026-01-05', scope: 5, started: 0, completed: 2 });
   });

   it('o rollover grava o snapshot do dia do cycle current', async () => {
      const db = await setup('current');
      await addIssue(db, 1, 'in-progress', 4);

      await rolloverCyclesForTeam(db, 'CORE', at('2026-01-06'));

      expect(await snapshotsOf(db)).toEqual([
         { cycleId: 'c1', date: '2026-01-06', scope: 4, started: 4, completed: 0 },
      ]);
   });

   it('cycle upcoming/completed não gera snapshot no GET', async () => {
      const db = await setup('completed');
      await getCycle(db, 'c1', at('2026-01-20'));
      expect(await snapshotsOf(db)).toHaveLength(0);
   });
});

describe('scopeDelta e burn-up a partir dos snapshots (#24)', () => {
   it('scopeDelta = variação do escopo atual sobre o primeiro snapshot', async () => {
      const db = await setup('completed');
      for (let n = 1; n <= 3; n++) await addIssue(db, n, 'done', 5); // escopo atual = 15
      await db.insert(cycleSnapshot).values([
         { cycleId: 'c1', date: '2026-01-01', scope: 10, started: 0, completed: 0 },
         { cycleId: 'c1', date: '2026-01-14', scope: 15, started: 0, completed: 15 },
      ]);

      const dto = (await getCycle(db, 'c1', at('2026-01-20')))!;
      expect(dto.scopeDelta).toBe(50);
   });

   it('burn-up vem dos snapshots; dia sem registro fica em branco (não interpola)', async () => {
      const db = await setup('completed', '2026-01-05');
      await addIssue(db, 1, 'done', 14); // agg.scope = 14 → linha ideal termina em 14
      await db.insert(cycleSnapshot).values([
         { cycleId: 'c1', date: '2026-01-01', scope: 10, started: 2, completed: 0 },
         { cycleId: 'c1', date: '2026-01-05', scope: 14, started: 6, completed: 8 },
      ]);

      const b = (await getCycle(db, 'c1', at('2026-01-20')))!.burnup!;

      expect(b.map((p) => p.date)).toEqual([
         '2026-01-01',
         '2026-01-02',
         '2026-01-03',
         '2026-01-04',
         '2026-01-05',
      ]);
      expect(b.map((p) => p.scope)).toEqual([10, null, null, null, 14]);
      expect(b.map((p) => p.completed)).toEqual([0, null, null, null, 8]);
      expect(b.map((p) => p.started)).toEqual([2, null, null, null, 6]);
      expect(b[0].ideal).toBe(0);
      expect(b[4].ideal).toBe(14);
   });

   it('não estende o valor medido para fora do intervalo gravado', async () => {
      const db = await setup('completed', '2026-01-05');
      await db.insert(cycleSnapshot).values([
         { cycleId: 'c1', date: '2026-01-02', scope: 10, started: 0, completed: 0 },
         { cycleId: 'c1', date: '2026-01-04', scope: 10, started: 0, completed: 10 },
      ]);

      const b = (await getCycle(db, 'c1', at('2026-01-20')))!.burnup!;
      expect(b.map((p) => p.completed)).toEqual([null, 0, null, 10, null]);
   });

   it('sem snapshots suficientes cai no sintético (scope plano, marcos das issues)', async () => {
      const db = await setup('completed', '2026-01-05');
      await addIssue(db, 1, 'done', 6);
      await db
         .update(issue)
         .set({ completedAt: new Date('2026-01-03T12:00:00Z') })
         .where(eq(issue.id, 'i1'));
      // 1 snapshot só não desenha curva — precisa de 2 pontos.
      await db
         .insert(cycleSnapshot)
         .values({ cycleId: 'c1', date: '2026-01-01', scope: 6, started: 0, completed: 0 });

      const dto = (await getCycle(db, 'c1', at('2026-01-20')))!;
      expect(dto.burnup!.map((p) => p.scope)).toEqual([6, 6, 6, 6, 6]);
      expect(dto.burnup!.map((p) => p.completed)).toEqual([0, 0, 6, 6, 6]);
      expect(dto.scopeDelta).toBe(0);
   });
});
