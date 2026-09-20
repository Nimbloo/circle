import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedWorkspaceFixture, type WorkspaceFixture } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { issue as issueT, team as teamT } from '@/db/schema';
import { firstRank } from '@/lib/api/rank';

// Espiona só a saída de webhooks; o resto do barramento segue real.
const webhooks = vi.hoisted(() => ({
   calls: [] as { entity: string; action: string; id?: string }[],
}));
vi.mock('@/lib/api/events', async (importOriginal) => {
   const real = await importOriginal<typeof import('@/lib/api/events')>();
   return {
      ...real,
      dispatchWebhooksOnly: (e: { entity: string; action: string; id?: string }) =>
         webhooks.calls.push(e),
   };
});

import { commitImport } from '@/lib/api/import';

/**
 * O import é silencioso para o SSE (um evento coarse no fim, #7), mas webhook é contrato
 * externo: quem assina `issue.created` continua recebendo uma entrega por issue importada.
 */
let db: Db;
let fx: WorkspaceFixture;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   fx = await seedWorkspaceFixture(db);
   await db.update(issueT).set({ rank: firstRank() }).where(eq(issueT.id, fx.issueId));
   await db.update(teamT).set({ issueSeq: 1 }).where(eq(teamT.id, fx.teamId));
   webhooks.calls = [];
});
afterEach(() => __setTestDb(null));

describe('import mantém os webhooks por issue', () => {
   it('N linhas importadas → N webhooks issue.created', async () => {
      const csv = ['ID,Title', ...Array.from({ length: 4 }, (_, i) => `X-${i},Linha ${i}`)].join(
         '\n'
      );
      const res = await commitImport(
         db,
         { source: 'csv', csv, mapping: { externalId: 'ID', title: 'Title' }, teamId: fx.teamId },
         fx.ownerEmail
      );
      expect(res.created).toBe(4);
      const created = webhooks.calls.filter((e) => e.entity === 'issue' && e.action === 'created');
      expect(created).toHaveLength(4);
      expect(created.every((e) => typeof e.id === 'string')).toBe(true);
   });
});
