import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue as issueT, issueTriageSuggestion } from '@/db/schema';
import {
   dismissTriageSuggestion,
   generateTriageSuggestion,
   getTriageSuggestion,
} from '@/lib/api/triage';

/**
 * Concorrência da geração de triagem (auditoria v0.29.0): read-then-write sem lock —
 * duas abas geravam duas vezes — e o `set` do upsert zerava `applied_at`/`dismissed_at`,
 * então uma geração EM VOO ressuscitava um card já descartado.
 */

const ANA = 'ana@nimbloo.ai';
let db: Db;

async function addIssue(id: string, title: string) {
   const now = new Date('2026-01-01T00:00:00Z');
   await db.insert(issueT).values({
      id,
      identifier: `CORE-${id}`,
      teamId: 'CORE',
      title,
      statusId: 'triage',
      priorityId: 'high',
      rank: id,
      createdAt: now,
      updatedAt: now,
   });
}

/** Resposta do "modelo" com atraso controlado, para provar a corrida. */
function slowInvoke(ms: number, calls: { n: number }) {
   return async () => {
      calls.n++;
      await new Promise((r) => setTimeout(r, ms));
      return JSON.stringify({
         teamId: 'CORE',
         priorityId: 'high',
         labelIds: [],
         duplicates: [],
         summary: 'resumo do modelo',
      });
   };
}

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin' });
});

describe('geração de triagem — concorrência', () => {
   it('dedupe em voo: duas chamadas simultâneas geram UMA vez', async () => {
      await addIssue('i-1', 'Login trava no SSO');
      const calls = { n: 0 };

      const [a, b] = await Promise.all([
         generateTriageSuggestion(db, 'i-1', { invoke: slowInvoke(30, calls) }),
         generateTriageSuggestion(db, 'i-1', { invoke: slowInvoke(30, calls) }),
      ]);

      expect(calls.n).toBe(1);
      expect(a?.summary).toBe('resumo do modelo');
      expect(b?.summary).toBe('resumo do modelo');

      const rows = await db
         .select()
         .from(issueTriageSuggestion)
         .where(eq(issueTriageSuggestion.issueId, 'i-1'));
      expect(rows).toHaveLength(1);
   });

   it('geração em voo NÃO ressuscita um card descartado no meio do caminho', async () => {
      await addIssue('i-1', 'Login trava no SSO');

      // A corrida real (dois pods): a geração já checou "não existe sugestão" e está no
      // modelo quando o card nasce e é descartado. O upsert do fim não pode reabri-lo.
      let dismissedAt: string | null = null;
      await generateTriageSuggestion(db, 'i-1', {
         invoke: async () => {
            await db.insert(issueTriageSuggestion).values({
               issueId: 'i-1',
               payload: {
                  teamId: null,
                  priorityId: null,
                  labelIds: [],
                  duplicates: [],
                  summary: 'card do outro pod',
               },
               source: 'heuristic',
               createdAt: new Date('2026-01-01T00:00:00Z'),
            });
            dismissedAt = (await dismissTriageSuggestion(db, 'i-1')).dismissedAt;
            expect(dismissedAt).not.toBeNull();
            return JSON.stringify({
               teamId: 'CORE',
               priorityId: 'high',
               labelIds: [],
               duplicates: [],
               summary: 'resumo atrasado',
            });
         },
      });

      const after = await getTriageSuggestion(db, 'i-1');
      expect(after?.dismissedAt).toBe(dismissedAt);
      // E o conteúdo do card resolvido também fica intacto.
      expect(after?.summary).toBe('card do outro pod');
   });

   it('regeneração explícita (force) reabre o card — é decisão do usuário', async () => {
      await addIssue('i-1', 'Login trava no SSO');
      await generateTriageSuggestion(db, 'i-1', { invoke: slowInvoke(0, { n: 0 }) });
      await dismissTriageSuggestion(db, 'i-1');

      await generateTriageSuggestion(db, 'i-1', {
         force: true,
         invoke: slowInvoke(0, { n: 0 }),
      });
      const after = await getTriageSuggestion(db, 'i-1');
      expect(after?.dismissedAt).toBeNull();
   });
});
