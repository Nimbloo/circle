import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import { activityEvent, cycle } from '@/db/schema';
import { createIssue, updateIssue } from '@/lib/api/issues';
import { listActivity } from '@/lib/api/issue-detail';

/**
 * is#8: o histórico da issue mostrava o UUID do ciclo e não dizia de/para em status e
 * prioridade.
 */
const ME = 'dev@nimbloo.ai';
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   for (const [id, n] of [
      [C1, 1],
      [C2, 2],
   ] as [string, number][]) {
      await db.insert(cycle).values({
         id,
         number: n,
         name: `Cycle ${n}`,
         teamId: 'CORE',
         status: n === 1 ? 'current' : 'upcoming',
         startDate: '2026-01-01',
         endDate: '2026-01-14',
         capacity: 40,
      });
   }
   const dto = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ME
   );
   return { db, dto };
}

const texts = async (db: Awaited<ReturnType<typeof makeTestDb>>, id: string, event: string) =>
   (await listActivity(db, id)).filter((a) => a.event === event).map((a) => a.text);

describe('texto do histórico da issue (is#8)', () => {
   it('status e prioridade dizem de/para pelo nome', async () => {
      const { db, dto } = await setup();
      await updateIssue(db, dto.id, { statusId: 'in-progress', priorityId: 'high' }, ME);
      expect(await texts(db, dto.id, 'status')).toEqual([
         'changed status from Todo to In Progress',
      ]);
      expect(await texts(db, dto.id, 'priority')).toEqual(['changed priority from Low to High']);
   });

   it('ciclo aparece pelo nome, nunca pelo id', async () => {
      const { db, dto } = await setup();
      await updateIssue(db, dto.id, { cycleId: C1 }, ME);
      await updateIssue(db, dto.id, { cycleId: C2 }, ME);
      await updateIssue(db, dto.id, { cycleId: null }, ME);
      const out = await texts(db, dto.id, 'cycle');
      expect(out).toEqual([
         'added to cycle Cycle 1',
         'moved from Cycle 1 to Cycle 2',
         'removed from cycle Cycle 2',
      ]);
      expect(out.join(' ')).not.toMatch(/[0-9a-f]{8}-/);
   });

   it('remover o ciclo com "" (o que a UI envia) também vira "removed from cycle"', async () => {
      const { db, dto } = await setup();
      await updateIssue(db, dto.id, { cycleId: C1 }, ME);
      await updateIssue(db, dto.id, { cycleId: '' }, ME);
      expect(await texts(db, dto.id, 'cycle')).toEqual([
         'added to cycle Cycle 1',
         'removed from cycle Cycle 1',
      ]);
   });

   it('evento legado "changed cycle from X to " (sem destino) lê como remoção', async () => {
      const { db, dto } = await setup();
      await db.insert(activityEvent).values({
         id: crypto.randomUUID(),
         issueId: dto.id,
         actorId: null,
         event: 'cycle',
         text: `changed cycle from ${C2} to `,
         createdAt: new Date(),
      });
      expect(await texts(db, dto.id, 'cycle')).toEqual(['removed from cycle Cycle 2']);
   });

   it('auto-add ao iniciar mostra o nome do ciclo', async () => {
      const { db, dto } = await setup();
      await updateIssue(db, dto.id, { statusId: 'in-progress' }, ME);
      expect(await texts(db, dto.id, 'cycle')).toEqual(['added to cycle Cycle 1 on start']);
   });
});
