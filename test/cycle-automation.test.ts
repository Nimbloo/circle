import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { createIssue, updateIssue, getIssue } from '@/lib/api/issues';
import {
   ensureCycles,
   getCycleSettings,
   updateCycleSettings,
   listCyclesByTeam,
   startCycleToday,
} from '@/lib/api/cycles';
import {
   alignToStartDay,
   generateSchedule,
   deriveStatus,
   planEnsure,
} from '@/lib/api/cycle-schedule';

/* ── Lógica pura de agendamento ─────────────────────────────────────── */
describe('cycle-schedule (pure)', () => {
   it('alignToStartDay volta pro dia-da-semana âncora', () => {
      // 2026-08-19 é uma quarta (UTC getDay=3). startDay=1 (segunda) → volta 2 dias.
      expect(alignToStartDay('2026-08-19', 1)).toBe('2026-08-17');
      // startDay = a própria quarta → mesmo dia.
      expect(alignToStartDay('2026-08-19', 3)).toBe('2026-08-19');
   });

   it('generateSchedule encadeia ciclos com duração + cooldown', () => {
      const s = { durationWeeks: 2, startDay: 1, cooldownWeeks: 0, upcomingCount: 2 };
      const plan = generateSchedule('2026-08-17', s, 3);
      expect(plan[0]).toMatchObject({ startDate: '2026-08-17', endDate: '2026-08-30' });
      expect(plan[1].startDate).toBe('2026-08-31'); // dia seguinte ao fim
      expect(plan[2].startDate).toBe('2026-09-14');
   });

   it('cooldown insere gap entre ciclos', () => {
      const s = { durationWeeks: 1, startDay: 1, cooldownWeeks: 1, upcomingCount: 2 };
      const plan = generateSchedule('2026-08-17', s, 2);
      expect(plan[0].endDate).toBe('2026-08-23');
      // fim 23 + 1 + 7 (cooldown) = 31
      expect(plan[1].startDate).toBe('2026-08-31');
   });

   it('deriveStatus classifica por datas', () => {
      expect(deriveStatus('2026-08-17', '2026-08-30', '2026-08-10')).toBe('upcoming');
      expect(deriveStatus('2026-08-17', '2026-08-30', '2026-08-20')).toBe('current');
      expect(deriveStatus('2026-08-17', '2026-08-30', '2026-09-01')).toBe('completed');
   });

   it('planEnsure sem ciclos cria current + upcomingCount', () => {
      const s = { durationWeeks: 2, startDay: 1, cooldownWeeks: 0, upcomingCount: 2 };
      const plan = planEnsure([], s, '2026-08-19');
      // 1 current (cobre hoje) + 2 upcoming = 3
      expect(plan.toCreate).toHaveLength(3);
      expect(plan.toCreate[0].number).toBe(1);
      expect(deriveStatus(plan.toCreate[0].startDate, plan.toCreate[0].endDate, '2026-08-19')).toBe(
         'current'
      );
   });

   it('planEnsure é idempotente quando já há upcoming suficiente', () => {
      const s = { durationWeeks: 2, startDay: 1, cooldownWeeks: 0, upcomingCount: 1 };
      const existing = [
         { number: 1, startDate: '2026-08-17', endDate: '2026-08-30', cooldownWeeks: 0 }, // current
         { number: 2, startDate: '2026-08-31', endDate: '2026-09-13', cooldownWeeks: 0 }, // upcoming
      ];
      expect(planEnsure(existing, s, '2026-08-19').toCreate).toHaveLength(0);
   });
});

/* ── ensureCycles / settings / rollover (com db) ────────────────────── */
async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   return db;
}

describe('cycle automation (db)', () => {
   it('não gera nada com cycles desabilitados; gera ao habilitar', async () => {
      const db = await setup();
      await ensureCycles(db, 'CORE', '2026-08-19');
      expect(await listCyclesByTeam(db, 'CORE')).toHaveLength(0);

      await updateCycleSettings(db, 'CORE', {
         enabled: true,
         durationWeeks: 2,
         startDay: 1,
         upcomingCount: 2,
      });
      const cycles = await listCyclesByTeam(db, 'CORE');
      expect(cycles.length).toBeGreaterThanOrEqual(3); // current + 2 upcoming
      expect(cycles.some((c) => c.status === 'current')).toBe(true);
      expect(cycles.filter((c) => c.status === 'upcoming').length).toBeGreaterThanOrEqual(2);
   });

   it('getCycleSettings reflete o update', async () => {
      const db = await setup();
      await updateCycleSettings(db, 'CORE', { enabled: true, cooldownWeeks: 1, durationWeeks: 3 });
      const s = await getCycleSettings(db, 'CORE');
      expect(s).toMatchObject({ enabled: true, cooldownWeeks: 1, durationWeeks: 3 });
   });

   it('rollover: start-today move issues abertas pro novo ciclo e congela o snapshot', async () => {
      const db = await setup();
      await updateCycleSettings(db, 'CORE', {
         enabled: true,
         durationWeeks: 2,
         startDay: 1,
         upcomingCount: 2,
      });
      const before = await listCyclesByTeam(db, 'CORE');
      const current = before.find((c) => c.status === 'current')!;

      // 2 issues no ciclo corrente: uma aberta (to-do), uma concluída (done).
      const open = await createIssue(
         db,
         { teamId: 'CORE', title: 'Aberta', statusId: 'to-do', priorityId: 'low', cycleId: current.id },
         'ana@nimbloo.ai'
      );
      const done = await createIssue(
         db,
         { teamId: 'CORE', title: 'Feita', statusId: 'done', priorityId: 'low', cycleId: current.id },
         'ana@nimbloo.ai'
      );

      await startCycleToday(db, 'CORE');

      // a aberta rolou pro novo current; a feita ficou no ciclo encerrado.
      const openAfter = await getIssue(db, open.id);
      const doneAfter = await getIssue(db, done.id);
      const after = await listCyclesByTeam(db, 'CORE');
      const newCurrent = after.find((c) => c.status === 'current')!;
      const closed = after.find((c) => c.id === current.id)!;

      expect(newCurrent.id).not.toBe(current.id);
      expect(openAfter?.cycleId).toBe(newCurrent.id);
      expect(doneAfter?.cycleId).toBe(current.id);
      expect(closed.status).toBe('completed');
      // snapshot congelado: scope 2 (incluía a aberta), completed 1.
      expect(closed.scope).toBe(2);
      expect(closed.completed).toBe(1);
      expect(closed.successRate).toBe(50);
   });
});
