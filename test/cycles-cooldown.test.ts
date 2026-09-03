import { describe, it, expect } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { cycle, issue, team } from '@/db/schema';
import { rolloverCyclesForTeam } from '@/lib/api/cycles';
import { cooldownUntil } from '@/data/cycles';
import type { Cycle } from '@/data/cycles';

/**
 * Cool-down (#24): ao vencer o current sem upcoming, o rollover cria o próximo cycle
 * começando em `fim do anterior + cool-down` do time, e durante esse intervalo nenhum
 * cycle é `current`. `now` é injetado para não depender do relógio.
 */

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

async function setup(cooldownDays: number) {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await db.update(team).set({ cycleCooldownDays: cooldownDays }).where(eq(team.id, 'CORE'));
   await db.insert(cycle).values({
      id: 'c1',
      number: 1,
      name: 'Cycle 1',
      teamId: 'CORE',
      status: 'current',
      startDate: '2026-01-01',
      endDate: '2026-01-14',
      capacity: 70,
   });
   await db.insert(issue).values({
      id: 'i1',
      identifier: 'CORE-1',
      teamId: 'CORE',
      title: 'em aberto',
      statusId: 'to-do',
      priorityId: 'low',
      rank: 'a',
      cycleId: 'c1',
   });
   return db;
}

const cyclesOf = (db: Awaited<ReturnType<typeof setup>>) =>
   db.select().from(cycle).where(eq(cycle.teamId, 'CORE')).orderBy(asc(cycle.number));

describe('rollover com cool-down (#24)', () => {
   it('cria o próximo cycle em fim + cool-down e fica sem current no intervalo', async () => {
      const db = await setup(3);

      await rolloverCyclesForTeam(db, 'CORE', at('2026-01-15'));

      const [c1, c2] = await cyclesOf(db);
      expect(c1.status).toBe('completed');
      expect(c2).toMatchObject({
         number: 2,
         name: 'Cycle 2',
         status: 'upcoming', // cool-down: ninguém é current
         startDate: '2026-01-18', // 14 + 1 + 3 dias
         endDate: '2026-01-31', // mesma duração (14 dias)
         capacity: 70,
      });
      // As issues em aberto já rolam pro próximo mesmo durante o cool-down.
      const [i1] = await db.select().from(issue).where(eq(issue.id, 'i1'));
      expect(i1.cycleId).toBe(c2.id);
   });

   it('promove o próximo a current quando o cool-down termina (idempotente)', async () => {
      const db = await setup(3);
      await rolloverCyclesForTeam(db, 'CORE', at('2026-01-15'));
      await rolloverCyclesForTeam(db, 'CORE', at('2026-01-17')); // ainda em cool-down
      expect((await cyclesOf(db)).map((c) => c.status)).toEqual(['completed', 'upcoming']);

      await rolloverCyclesForTeam(db, 'CORE', at('2026-01-18'));
      await rolloverCyclesForTeam(db, 'CORE', at('2026-01-18')); // repetir não duplica

      const rows = await cyclesOf(db);
      expect(rows).toHaveLength(2);
      expect(rows.map((c) => c.status)).toEqual(['completed', 'current']);
   });

   it('sem cool-down o próximo começa no dia seguinte e já vira current', async () => {
      const db = await setup(0);

      await rolloverCyclesForTeam(db, 'CORE', at('2026-01-15'));

      const [, c2] = await cyclesOf(db);
      expect(c2).toMatchObject({
         status: 'current',
         startDate: '2026-01-15',
         endDate: '2026-01-28',
      });
   });

   it('respeita um upcoming criado à mão em vez de criar outro', async () => {
      const db = await setup(3);
      await db.insert(cycle).values({
         id: 'c2',
         number: 2,
         name: 'Planejado à mão',
         teamId: 'CORE',
         status: 'upcoming',
         startDate: '2026-01-20',
         endDate: '2026-02-02',
         capacity: 0,
      });

      await rolloverCyclesForTeam(db, 'CORE', at('2026-01-15'));

      const rows = await cyclesOf(db);
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({ id: 'c2', status: 'upcoming', startDate: '2026-01-20' });
   });
});

describe('cooldownUntil (UI)', () => {
   const base = { teamId: 'CORE', capacity: 0, scope: 0, scopeDelta: 0, started: 0, completed: 0 };
   const c = (p: Pick<Cycle, 'id' | 'status' | 'startDate' | 'endDate'>): Cycle => ({
      number: 1,
      name: p.id,
      ...base,
      ...p,
   });

   it('aponta o início do próximo upcoming quando não há current e o último já encerrou', () => {
      const cycles = [
         c({ id: 'c2', status: 'upcoming', startDate: '2026-01-18', endDate: '2026-01-31' }),
         c({ id: 'c1', status: 'completed', startDate: '2026-01-01', endDate: '2026-01-14' }),
      ];
      expect(cooldownUntil(cycles, '2026-01-16')).toBe('2026-01-18');
   });

   it('é null com cycle current ou sem cycle encerrado', () => {
      const current = c({
         id: 'c1',
         status: 'current',
         startDate: '2026-01-01',
         endDate: '2026-01-14',
      });
      const upcoming = c({
         id: 'c2',
         status: 'upcoming',
         startDate: '2026-01-18',
         endDate: '2026-01-31',
      });
      expect(cooldownUntil([current, upcoming], '2026-01-10')).toBeNull();
      expect(cooldownUntil([upcoming], '2026-01-10')).toBeNull();
   });
});
