import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue, moveIssueToTeam } from '@/lib/api/issues';
import { cycle as cycleT, issue as issueT } from '@/db/schema';
import { eq } from 'drizzle-orm';

const ANA = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE', 'Core');
   await seedTeam(db, 'DES', 'Design');
   await seedUser(db, { name: 'Ana', email: ANA });
   return { db };
}

const mk = (db: Awaited<ReturnType<typeof setup>>['db'], cycleId?: string) =>
   createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low', cycleId },
      ANA
   );

describe('move issue to team', () => {
   it('reatribui o identifier a partir do issueSeq do time destino', async () => {
      const { db } = await setup();
      const issue = await mk(db);
      const moved = await moveIssueToTeam(db, issue.id, 'DES');
      expect(moved?.teamId).toBe('DES');
      expect(moved?.identifier).toMatch(/^DES-\d+$/);
      expect(moved?.identifier).not.toBe(issue.identifier);
   });

   it('limpa o cycle ao mover (ciclo é por-time)', async () => {
      const { db } = await setup();
      await db.insert(cycleT).values({
         id: 'cy1',
         number: 1,
         name: 'Cycle 1',
         teamId: 'CORE',
         status: 'active',
         startDate: '2026-01-01',
         endDate: '2026-01-14',
      });
      const issue = await mk(db, 'cy1');
      await moveIssueToTeam(db, issue.id, 'DES');
      const [row] = await db
         .select({ cycleId: issueT.cycleId })
         .from(issueT)
         .where(eq(issueT.id, issue.id));
      expect(row.cycleId ?? '').toBe('');
   });

   it('mover para o mesmo time é no-op (mantém o identifier)', async () => {
      const { db } = await setup();
      const issue = await mk(db);
      const moved = await moveIssueToTeam(db, issue.id, 'CORE');
      expect(moved?.identifier).toBe(issue.identifier);
   });

   it('time inexistente lança erro; issue inexistente retorna null', async () => {
      const { db } = await setup();
      const issue = await mk(db);
      await expect(moveIssueToTeam(db, issue.id, 'GHOST')).rejects.toThrow(/não existe/i);
      expect(await moveIssueToTeam(db, 'nao-existe', 'DES')).toBeNull();
   });
});
