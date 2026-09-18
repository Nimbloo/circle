import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { cycle, issue } from '@/db/schema';
import { rolloverCyclesForTeam } from '@/lib/api/cycles';
import { subscribe, type CircleEvent } from '@/lib/api/events';

/**
 * Rollover de ciclo (#20): antes era silencioso (issues mudavam de ciclo sem evento) e o
 * `cycle/created` do próximo saía DE DENTRO da transação — antes do commit. Agora tudo
 * é publicado depois do commit: ciclos tocados + sinal de issues do time.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
function daysFromNow(n: number): string {
   const d = new Date();
   d.setDate(d.getDate() + n);
   return iso(d);
}

let parar: (() => void) | null = null;
afterEach(() => parar?.());

describe('rollover publica depois do commit', () => {
   it('publica os ciclos tocados e o sinal de issues, nada antes do commit', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await db.insert(cycle).values({
         id: 'c1',
         number: 1,
         name: 'Cycle 1',
         teamId: 'CORE',
         status: 'current',
         startDate: daysFromNow(-14),
         endDate: daysFromNow(-1),
         capacity: 0,
      });
      await db.insert(issue).values({
         id: 'i1',
         identifier: 'CORE-1',
         teamId: 'CORE',
         title: 'em aberto',
         statusId: 'in-progress',
         priorityId: 'low',
         rank: 'a',
         cycleId: 'c1',
      });

      const eventos: CircleEvent[] = [];
      let dentroDaTransacao = false;
      // Se algum publish acontecer enquanto a transação está aberta, marca.
      const txOriginal = db.transaction.bind(db);
      (db as unknown as { transaction: typeof db.transaction }).transaction = (async (
         fn: Parameters<typeof db.transaction>[0]
      ) => {
         dentroDaTransacao = true;
         try {
            return await txOriginal(fn);
         } finally {
            dentroDaTransacao = false;
         }
      }) as typeof db.transaction;
      const publicadosDentro: CircleEvent[] = [];
      parar = subscribe((e) => {
         eventos.push(e);
         if (dentroDaTransacao) publicadosDentro.push(e);
      });

      await rolloverCyclesForTeam(db, 'CORE');

      expect(publicadosDentro).toEqual([]);
      const ciclos = eventos.filter((e) => e.entity === 'cycle');
      expect(ciclos.find((e) => e.action === 'created')).toBeTruthy();
      expect(ciclos.some((e) => e.action === 'updated' && e.id === 'c1')).toBe(true);
      expect(ciclos.every((e) => e.teamId === 'CORE')).toBe(true);
      const issues = eventos.filter((e) => e.entity === 'issue');
      expect(issues).toHaveLength(1);
      expect(issues[0].teamId).toBe('CORE');
   });

   it('sem nada vencido, não publica nada', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await db.insert(cycle).values({
         id: 'c1',
         number: 1,
         name: 'Cycle 1',
         teamId: 'CORE',
         status: 'current',
         startDate: daysFromNow(-1),
         endDate: daysFromNow(10),
         capacity: 0,
      });
      const eventos: CircleEvent[] = [];
      parar = subscribe((e) => eventos.push(e));
      await rolloverCyclesForTeam(db, 'CORE');
      expect(eventos).toEqual([]);
   });
});
