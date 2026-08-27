import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { cycle, issue } from '@/db/schema';
import { rolloverCyclesForTeam } from '@/lib/api/cycles';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function daysFromNow(n: number): string {
   const d = new Date();
   d.setDate(d.getDate() + n);
   return iso(d);
}

describe('cycles auto-rollover (#24)', () => {
   it('fecha o current vencido, carrega incompletas e promove o próximo', async () => {
      const db = await setup();
      await db.insert(cycle).values([
         {
            id: 'c1',
            number: 1,
            name: 'Cycle 1',
            teamId: 'CORE',
            status: 'current',
            startDate: daysFromNow(-14),
            endDate: daysFromNow(-1),
            capacity: 0,
         },
         {
            id: 'c2',
            number: 2,
            name: 'Cycle 2',
            teamId: 'CORE',
            status: 'upcoming',
            startDate: daysFromNow(0),
            endDate: daysFromNow(13),
            capacity: 0,
         },
      ]);
      await db.insert(issue).values([
         {
            id: 'i1',
            identifier: 'CORE-1',
            teamId: 'CORE',
            title: 'em aberto (started)',
            statusId: 'in-progress',
            priorityId: 'low',
            rank: 'a',
            cycleId: 'c1',
         },
         {
            id: 'i2',
            identifier: 'CORE-2',
            teamId: 'CORE',
            title: 'concluida',
            statusId: 'done',
            priorityId: 'low',
            rank: 'b',
            cycleId: 'c1',
         },
         {
            id: 'i3',
            identifier: 'CORE-3',
            teamId: 'CORE',
            title: 'backlog (não rola — paridade Linear)',
            statusId: 'backlog',
            priorityId: 'low',
            rank: 'c',
            cycleId: 'c1',
         },
         {
            id: 'i4',
            identifier: 'CORE-4',
            teamId: 'CORE',
            title: 'todo (unstarted, rola)',
            statusId: 'to-do',
            priorityId: 'low',
            rank: 'd',
            cycleId: 'c1',
         },
      ]);

      await rolloverCyclesForTeam(db, 'CORE');

      const [c1] = await db.select().from(cycle).where(eq(cycle.id, 'c1'));
      const [c2] = await db.select().from(cycle).where(eq(cycle.id, 'c2'));
      expect(c1.status).toBe('completed');
      expect(c2.status).toBe('current'); // promovido (startDate <= hoje)

      const byId = Object.fromEntries(
         (await db.select().from(issue)).map((i) => [i.id, i.cycleId])
      );
      expect(byId['i1']).toBe('c2'); // started migrou pro próximo
      expect(byId['i4']).toBe('c2'); // unstarted (todo) migrou
      expect(byId['i2']).toBe('c1'); // concluída ficou no cycle fechado
      expect(byId['i3']).toBe('c1'); // backlog NÃO rola (Linear exclui)
   });

   it('não faz nada se o current ainda está em andamento', async () => {
      const db = await setup();
      await db.insert(cycle).values({
         id: 'c1',
         number: 1,
         name: 'Cycle 1',
         teamId: 'CORE',
         status: 'current',
         startDate: daysFromNow(-3),
         endDate: daysFromNow(4),
         capacity: 0,
      });
      await rolloverCyclesForTeam(db, 'CORE');
      const [c1] = await db.select().from(cycle).where(eq(cycle.id, 'c1'));
      expect(c1.status).toBe('current');
   });
});
