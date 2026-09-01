import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { activityEvent, cycle, issue as issueT } from '@/db/schema';
import { createIssue, updateIssue } from '@/lib/api/issues';
import { getCycle } from '@/lib/api/cycles';

/**
 * Burn-up reconstruído de `issue.startedAt`/`completedAt`.
 *
 * Antes eram DOIS pontos sintéticos (início→hoje), o que não é burn-up: é uma reta
 * ligando o começo ao estado atual, sem informação nenhuma sobre o caminho.
 *
 * A linha de `scope` continua PLANA de propósito — não existe registro de quando a
 * issue entrou no ciclo (auto-add e carry-over reescrevem `cycleId` sem rastro), então
 * projetar o escopo atual para trás é o mais honesto possível sem snapshots.
 */

const ME = 'dev@nimbloo.ai';

async function cycleWith(marks: { started?: string; completed?: string; estimate: number }[]) {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await db.insert(cycle).values({
      id: 'c1',
      number: 1,
      name: 'Cycle 1',
      teamId: 'CORE',
      status: 'completed', // completed => a série vai até endDate, sem depender de "hoje"
      startDate: '2026-01-01',
      endDate: '2026-01-05',
      capacity: 40,
   });

   for (const [i, m] of marks.entries()) {
      const dto = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: `I${i}`,
            statusId: m.completed ? 'done' : m.started ? 'in-progress' : 'to-do',
            priorityId: 'low',
            estimate: m.estimate,
         },
         ME
      );
      await db
         .update(issueT)
         .set({
            cycleId: 'c1',
            startedAt: m.started ? new Date(`${m.started}T12:00:00Z`) : null,
            completedAt: m.completed ? new Date(`${m.completed}T12:00:00Z`) : null,
         })
         .where(eq(issueT.id, dto.id));
   }
   return db;
}

describe('burn-up do ciclo', () => {
   it('desenha um ponto por dia do ciclo, nao dois pontos sinteticos', async () => {
      const db = await cycleWith([{ started: '2026-01-01', completed: '2026-01-03', estimate: 5 }]);
      const dto = await getCycle(db, 'c1');

      // 01 a 05 de janeiro, inclusive.
      expect(dto?.burnup).toHaveLength(5);
      expect(dto?.burnup?.map((p) => p.date)).toEqual([
         '2026-01-01',
         '2026-01-02',
         '2026-01-03',
         '2026-01-04',
         '2026-01-05',
      ]);
   });

   it('completed e cumulativo e acompanha a data real de conclusao', async () => {
      const db = await cycleWith([
         { started: '2026-01-01', completed: '2026-01-02', estimate: 3 },
         { started: '2026-01-01', completed: '2026-01-04', estimate: 2 },
      ]);
      const b = (await getCycle(db, 'c1'))!.burnup!;

      expect(b.map((p) => p.completed)).toEqual([0, 3, 3, 5, 5]);
      // Quem ja concluiu sai de `started` — senao a issue seria contada duas vezes.
      expect(b.map((p) => p.started)).toEqual([5, 2, 2, 0, 0]);
   });

   it('scope e plano e igual ao total: nao ha historico de entrada no ciclo', async () => {
      const db = await cycleWith([
         { started: '2026-01-02', estimate: 8 },
         { completed: '2026-01-03', estimate: 2 },
      ]);
      const b = (await getCycle(db, 'c1'))!.burnup!;

      expect(new Set(b.map((p) => p.scope))).toEqual(new Set([10]));
      // E por isso `scopeDelta` segue 0 — variação de escopo exigiria esse histórico.
      expect((await getCycle(db, 'c1'))!.scopeDelta).toBe(0);
   });

   it('a linha ideal vai de 0 ao escopo total ao longo do ciclo', async () => {
      const db = await cycleWith([{ completed: '2026-01-05', estimate: 4 }]);
      const b = (await getCycle(db, 'c1'))!.burnup!;

      expect(b[0].ideal).toBe(0);
      expect(b[b.length - 1].ideal).toBe(4);
   });

   it('issue sem marco nenhum nao inventa progresso', async () => {
      const db = await cycleWith([{ estimate: 6 }]);
      const b = (await getCycle(db, 'c1'))!.burnup!;

      expect(b.every((p) => p.started === 0 && p.completed === 0)).toBe(true);
      expect(b.every((p) => p.scope === 6)).toBe(true);
   });
});

/**
 * O histórico que HOJE não existe é o que bloqueia o `scopeDelta` real. Estas mudanças
 * começam a gravá-lo a partir de agora: sem elas, a maior fonte de crescimento de escopo
 * (o auto-add quando a issue entra em "started") era invisível.
 */
describe('historico de escopo do ciclo', () => {
   it('auto-add ao entrar em started deixa rastro no historico', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await db.insert(cycle).values({
         id: 'c1',
         number: 1,
         name: 'C1',
         teamId: 'CORE',
         status: 'current',
         startDate: '2026-01-01',
         endDate: '2026-01-14',
         capacity: 40,
      });
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
         ME
      );

      await updateIssue(db, dto.id, { statusId: 'in-progress' }, ME);

      const events = await db.select().from(activityEvent).where(eq(activityEvent.issueId, dto.id));
      const cycleEvent = events.find((e) => e.event === 'cycle');
      expect(cycleEvent?.text).toContain('added to cycle c1');
   });

   it('troca de ciclo grava DE e PARA, nao so "changed cycle"', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      for (const [id, n] of [
         ['c1', 1],
         ['c2', 2],
      ] as [string, number][]) {
         await db.insert(cycle).values({
            id,
            number: n,
            name: `C${n}`,
            teamId: 'CORE',
            status: n === 1 ? 'current' : 'upcoming',
            startDate: '2026-01-01',
            endDate: '2026-01-14',
            capacity: 40,
         });
      }
      const dto = await createIssue(
         db,
         { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low', cycleId: 'c1' },
         ME
      );

      await updateIssue(db, dto.id, { cycleId: 'c2' }, ME);

      const events = await db.select().from(activityEvent).where(eq(activityEvent.issueId, dto.id));
      const moved = events.find((e) => e.event === 'cycle' && e.text.includes('changed cycle'));
      expect(moved?.text).toBe('changed cycle from c1 to c2');
   });
});
