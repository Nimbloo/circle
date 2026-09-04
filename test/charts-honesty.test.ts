import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { cycle, cycleSnapshot } from '@/db/schema';
import { getCycle } from '@/lib/api/cycles';

/**
 * Gráficos honestos (auditoria v0.29.0): o burn-up interpolava linearmente os dias sem
 * snapshot — um ciclo sem medição por 15 dias desenhava uma cadência diária que nunca
 * existiu — e ainda "segurava" o primeiro/último valor para fora do intervalo medido.
 */

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function cycleWithSnapshots(rows: { date: string; completed: number }[]) {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await db.insert(cycle).values({
      id: 'c1',
      number: 1,
      name: 'Cycle 1',
      teamId: 'CORE',
      status: 'completed',
      startDate: '2026-01-01',
      endDate: '2026-01-05',
      capacity: 40,
   });
   await db.insert(cycleSnapshot).values(
      rows.map((r) => ({
         cycleId: 'c1',
         date: r.date,
         scope: 10,
         started: 0,
         completed: r.completed,
      }))
   );
   return db;
}

describe('burn-up — lacuna vira lacuna', () => {
   it('dia sem snapshot é null, não um ponto interpolado', async () => {
      const db = await cycleWithSnapshots([
         { date: '2026-01-01', completed: 0 },
         { date: '2026-01-05', completed: 8 },
      ]);
      const b = (await getCycle(db, 'c1', at('2026-01-20')))!.burnup!;

      expect(b.map((p) => p.date)).toEqual([
         '2026-01-01',
         '2026-01-02',
         '2026-01-03',
         '2026-01-04',
         '2026-01-05',
      ]);
      // Antes: [0, 2, 4, 6, 8] — uma cadência diária que ninguém mediu.
      expect(b.map((p) => p.completed)).toEqual([0, null, null, null, 8]);
      expect(b.map((p) => p.scope)).toEqual([10, null, null, null, 10]);
      // A linha ideal é referência calculada: continua em todos os dias.
      expect(b.every((p) => typeof p.ideal === 'number')).toBe(true);
   });

   it('não segura valor para fora do intervalo medido', async () => {
      const db = await cycleWithSnapshots([
         { date: '2026-01-02', completed: 0 },
         { date: '2026-01-04', completed: 10 },
      ]);
      const b = (await getCycle(db, 'c1', at('2026-01-20')))!.burnup!;
      // Antes: [0, 0, 5, 10, 10] — inventava as duas pontas e o meio.
      expect(b.map((p) => p.completed)).toEqual([null, 0, null, 10, null]);
   });
});
