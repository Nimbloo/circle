import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture, seedTeam, seedUser } from './helpers/fixtures';
import { bootstrapWorkspace } from '@/lib/api/workspace';
import { cycle } from '@/db/schema';
import { getCycle } from '@/lib/api/cycles';

const isoDay = (n: number) => {
   const d = new Date();
   d.setDate(d.getDate() + n);
   return d.toISOString().slice(0, 10);
};

async function seedExpiredCurrentCycle(db: Awaited<ReturnType<typeof makeTestDb>>) {
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
   await db.insert(cycle).values([
      {
         id: 'cx',
         number: 1,
         name: 'C1',
         teamId: 'CORE',
         status: 'current',
         startDate: isoDay(-14),
         endDate: isoDay(-1),
         capacity: 0,
      },
      {
         id: 'cy',
         number: 2,
         name: 'C2',
         teamId: 'CORE',
         status: 'upcoming',
         startDate: isoDay(0),
         endDate: isoDay(13),
         capacity: 0,
      },
   ]);
}

describe('workspace bootstrap', () => {
   it('returns all reference data stitched (teams with members+projects, cycles, etc.)', async () => {
      const db = await makeTestDb();
      const fx = await seedWorkspaceFixture(db);
      const ws = await bootstrapWorkspace(db, fx.ownerEmail);

      expect(ws.statuses.length).toBe(13);
      expect(ws.teams.length).toBeGreaterThan(0);
      expect(ws.projects.length).toBeGreaterThan(0);
      expect(ws.members.length).toBeGreaterThan(0);
      expect(ws.cycles.length).toBeGreaterThan(0);
      expect(ws.initiatives.length).toBeGreaterThan(0);
      expect(ws.views.length).toBeGreaterThan(0);

      // o usuário corrente é resolvido pelo email
      expect(ws.me.email).toBe(fx.ownerEmail);

      // times vêm costurados com members; projects NÃO (bootstrap enxuto: o cliente
      // deriva de `ws.projects` pelo teamId, sem a cópia duplicada)
      const core = ws.teams.find((t) => t.id === 'CORE');
      expect(core).toBeTruthy();
      expect(core!.members.length).toBeGreaterThan(0);
      expect('projects' in core!).toBe(false);
   });

   it('burnup só do ciclo current; os demais vêm sob demanda (getCycle)', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
      await db.insert(cycle).values([
         {
            id: 'past',
            number: 1,
            name: 'C1',
            teamId: 'CORE',
            status: 'completed',
            startDate: isoDay(-20),
            endDate: isoDay(-8),
            capacity: 0,
         },
         {
            id: 'now',
            number: 2,
            name: 'C2',
            teamId: 'CORE',
            status: 'current',
            startDate: isoDay(-3),
            endDate: isoDay(10),
            capacity: 0,
         },
      ]);
      const ws = await bootstrapWorkspace(db, 'ana@nimbloo.ai', { rollover: false });
      expect(ws.cycles.find((c) => c.id === 'now')?.burnup).not.toBeNull();
      expect(ws.cycles.find((c) => c.id === 'past')?.burnup).toBeNull();
      expect((await getCycle(db, 'past'))?.burnup).not.toBeNull();
   });

   it('rollover:false skips the cycle auto-rollover (no write on SSE refetch)', async () => {
      const db = await makeTestDb();
      await seedExpiredCurrentCycle(db);

      await bootstrapWorkspace(db, 'ana@nimbloo.ai', { rollover: false });
      const [cxAfter] = await db.select().from(cycle).where(eq(cycle.id, 'cx'));
      expect(cxAfter.status).toBe('current'); // intocado — rollover pulado
   });

   it('default rollover closes the expired current cycle (page boot)', async () => {
      const db = await makeTestDb();
      await seedExpiredCurrentCycle(db);

      await bootstrapWorkspace(db, 'ana@nimbloo.ai'); // rollover default = true
      const [cxAfter] = await db.select().from(cycle).where(eq(cycle.id, 'cx'));
      expect(cxAfter.status).not.toBe('current'); // fechado pelo rollover
   });
});
