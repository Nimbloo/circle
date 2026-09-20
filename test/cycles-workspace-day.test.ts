import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { cycle } from '@/db/schema';
import { rolloverCyclesForTeam } from '@/lib/api/cycles';
import { workspaceDay } from '@/lib/workspace-day';

/**
 * "Hoje" do servidor no fuso do workspace (Pl#22): em UTC, um ciclo que termina em
 * 14/01 fechava às 21h de Brasília do próprio dia 14.
 */

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
      capacity: 70,
   });
   return db;
}

const statusOf = async (db: Awaited<ReturnType<typeof setup>>) =>
   (await db.select().from(cycle).where(eq(cycle.id, 'c1')))[0].status;

afterEach(() => vi.unstubAllEnvs());

describe('dia do workspace', () => {
   it('workspaceDay usa America/Sao_Paulo por padrão e respeita CIRCLE_TIME_ZONE', () => {
      const lateNightBrt = new Date('2026-01-15T01:00:00Z'); // 22h de 14/01 em Brasília
      expect(workspaceDay(lateNightBrt)).toBe('2026-01-14');
      vi.stubEnv('CIRCLE_TIME_ZONE', 'UTC');
      expect(workspaceDay(lateNightBrt)).toBe('2026-01-15');
   });

   it('rollover não fecha o ciclo às 22h de Brasília do último dia', async () => {
      const db = await setup();
      await rolloverCyclesForTeam(db, 'CORE', new Date('2026-01-15T01:00:00Z'));
      expect(await statusOf(db)).toBe('current');

      await rolloverCyclesForTeam(db, 'CORE', new Date('2026-01-15T03:30:00Z'));
      expect(await statusOf(db)).toBe('completed');
   });
});
