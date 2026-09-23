import { describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue } from '@/db/schema';
import { createIssue, getIssue, reorderIssue, updateIssue } from '@/lib/api/issues';
import { firstRank, rankAfter } from '@/lib/api/rank';

const ACTOR = 'rank-owner@nimbloo.ai';
const RANK_LIMIT = 32;
/**
 * Volume para os moves-to-top encolherem o rank até o rebalanceamento entrar. O
 * rebalanceamento disparado pelo CREATE (append) tem teste próprio abaixo, com a issue
 * semeada já no limite — antes eram 3.000 creates (~2 min), que estouravam o timeout
 * com a suíte em paralelo.
 */
const CREATES = 300;

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Rank Owner', email: ACTOR, teamIds: ['CORE'] });
   return db;
}

describe('rebalanceamento de ranks por time', () => {
   it('300 creates + 100 moves-to-top pelo serviço ficam dentro do limite (rebalanceia)', async () => {
      const db = await setup();
      const ids: string[] = [];

      for (let i = 0; i < CREATES; i++) {
         const created = await createIssue(
            db,
            { teamId: 'CORE', title: `Issue ${i}`, statusId: 'to-do', priorityId: 'low' },
            ACTOR,
            { silent: true }
         );
         ids.push(created.id);
      }

      // Cada volta leva uma issue DIFERENTE (do fim) para antes da primeira atual: o rank do
      // topo encolhe a cada prepend até o rebalanceamento entrar.
      const MOVES = 100;
      let first = ids[0];
      for (let i = 0; i < MOVES; i++) {
         const moving = ids[ids.length - 1 - i];
         await reorderIssue(db, moving, null, first, ACTOR);
         first = moving;
      }

      const rows = await db
         .select({ id: issue.id, rank: issue.rank })
         .from(issue)
         .where(eq(issue.teamId, 'CORE'))
         .orderBy(asc(issue.rank));
      expect(rows).toHaveLength(CREATES);
      // A ordem pedida pelos moves sobrevive ao rebalanceamento: o último movido fica em
      // 1º, cada anterior logo depois — o topo é `ids[N-MOVES] … ids[N-1]`.
      expect(rows.slice(0, MOVES).map((r) => r.id)).toEqual(ids.slice(ids.length - MOVES));
      expect(Math.max(...rows.map((row) => row.rank.length))).toBeLessThanOrEqual(RANK_LIMIT);
      expect(new Set(rows.map((row) => row.rank)).size).toBe(rows.length);
   }, 60_000);

   it('o create cujo append passaria do limite rebalanceia o time', async () => {
      const db = await setup();
      // O append (`rankAfter`) cresce: medido, passa de 32 caracteres no ~1.096º. Em vez
      // de 1.100 creates, semeia uma issue já com o último rank que cabe.
      let atLimit = firstRank();
      while (rankAfter(atLimit).length <= RANK_LIMIT) atLimit = rankAfter(atLimit);
      expect(atLimit.length).toBeLessThanOrEqual(RANK_LIMIT);
      const seeded = await createIssue(
         db,
         { teamId: 'CORE', title: 'No limite', statusId: 'to-do', priorityId: 'low' },
         ACTOR,
         { silent: true }
      );
      await db.update(issue).set({ rank: atLimit }).where(eq(issue.id, seeded.id));

      await createIssue(
         db,
         { teamId: 'CORE', title: 'Estoura', statusId: 'to-do', priorityId: 'low' },
         ACTOR,
         { silent: true }
      );

      const rows = await db
         .select({ id: issue.id, rank: issue.rank })
         .from(issue)
         .where(eq(issue.teamId, 'CORE'))
         .orderBy(asc(issue.rank));
      expect(rows.map((r) => r.id)[0]).toBe(seeded.id); // a ordem se mantém
      expect(Math.max(...rows.map((row) => row.rank.length))).toBeLessThanOrEqual(RANK_LIMIT);
      expect(rows.find((r) => r.id === seeded.id)!.rank).not.toBe(atLimit); // rebalanceou
   });

   it('serializa updates concorrentes e calcula o diff com o estado bloqueado', async () => {
      const db = await setup();
      const alice = await seedUser(db, {
         name: 'Alice',
         email: 'alice@nimbloo.ai',
         teamIds: ['CORE'],
      });
      const bob = await seedUser(db, {
         name: 'Bob',
         email: 'bob@nimbloo.ai',
         teamIds: ['CORE'],
      });
      const created = await createIssue(
         db,
         { teamId: 'CORE', title: 'Concurrent', statusId: 'to-do', priorityId: 'low' },
         ACTOR,
         { silent: true }
      );

      await Promise.all([
         updateIssue(db, created.id, { assigneeIds: [alice] }, ACTOR, { silent: true }),
         updateIssue(db, created.id, { assigneeIds: [bob] }, ACTOR, { silent: true }),
      ]);

      const current = await getIssue(db, created.id);
      expect(current?.assignees).toHaveLength(1);
      expect([alice, bob]).toContain(current?.assignees[0]?.id);
   });
});
