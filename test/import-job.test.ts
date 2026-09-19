import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { ensureImportJobTable } from './helpers/import-job-table';
import { __setTestDb, type Db } from '@/db';

// Espiona o barramento: `publish` (SSE + webhook) × `publishInternal` (só SSE).
const bus = vi.hoisted(() => ({
   publish: [] as Record<string, unknown>[],
   internal: [] as Record<string, unknown>[],
   webhooks: [] as Record<string, unknown>[],
}));
vi.mock('@/lib/api/events', async (importOriginal) => {
   const real = await importOriginal<typeof import('@/lib/api/events')>();
   return {
      ...real,
      publish: (e: Record<string, unknown>) => bus.publish.push(e),
      publishInternal: (e: Record<string, unknown>) => bus.internal.push(e),
      dispatchWebhooksOnly: (e: Record<string, unknown>) => bus.webhooks.push(e),
   };
});
// Efeitos por linha que o import NÃO pode disparar (#10).
const effects = vi.hoisted(() => ({ automations: 0, slack: 0 }));
vi.mock('@/lib/api/automations', async (importOriginal) => {
   const real = await importOriginal<typeof import('@/lib/api/automations')>();
   return {
      ...real,
      runAutomations: async () => {
         effects.automations++;
      },
   };
});
vi.mock('@/lib/api/integrations/slack', async (importOriginal) => {
   const real = await importOriginal<typeof import('@/lib/api/integrations/slack')>();
   return {
      ...real,
      notifySlackEvent: async () => {
         effects.slack++;
      },
   };
});

import { getImportJob, startImportJob } from '@/lib/api/import';

/**
 * #10 — import vira JOB em background: `startImportJob` devolve o id na hora, o
 * processamento roda fora da request e o dono acompanha o progresso. Durante o job: sem
 * SSE por linha, sem Slack/automações/triagem por linha; webhooks `issue.created`
 * continuam por issue; no fim, UM evento coarse SÓ de SSE (#21) e um aviso ao dono.
 */
const ANA = 'ana@nimbloo.ai';
let db: Db;
let anaId = '';

beforeEach(async () => {
   db = await makeTestDb();
   await ensureImportJobTable(db);
   __setTestDb(db);
   await seedTeam(db, 'CORE');
   anaId = await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin', teamIds: ['CORE'] });
   await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai', teamIds: ['CORE'] });
   bus.publish = [];
   bus.internal = [];
   bus.webhooks = [];
   effects.automations = 0;
   effects.slack = 0;
});
afterEach(() => __setTestDb(null));

const CSV = [
   'ID,Title,Status',
   ...Array.from({ length: 5 }, (_, i) => `X-${i},Linha ${i},Triage`),
].join('\n');
const MAPPING = { externalId: 'ID', title: 'Title', status: 'Status' };

describe('import em background (#10)', () => {
   it('devolve o jobId na hora e o dono acompanha até concluir', async () => {
      const { jobId, finished } = await startImportJob(
         db,
         { source: 'csv', csv: CSV, mapping: MAPPING, teamId: 'CORE' },
         ANA
      );
      expect(typeof jobId).toBe('string');
      const early = await getImportJob(db, jobId, anaId);
      expect(early?.total).toBe(5);
      expect(['queued', 'running', 'succeeded']).toContain(early?.status);

      await finished;
      const done = await getImportJob(db, jobId, anaId);
      expect(done).toMatchObject({
         id: jobId,
         status: 'succeeded',
         total: 5,
         processed: 5,
         created: 5,
         updated: 0,
         skipped: 0,
         errors: [],
         error: null,
      });
      expect(done?.finishedAt).toBeTruthy();
   });

   it('só o dono enxerga o job', async () => {
      const { jobId, finished } = await startImportJob(
         db,
         { source: 'csv', csv: CSV, mapping: MAPPING, teamId: 'CORE' },
         ANA
      );
      await finished;
      expect(await getImportJob(db, jobId, 'outro-usuario')).toBeNull();
   });

   it('sem SSE nem efeitos por linha; webhook por issue; coarse só SSE; aviso ao dono', async () => {
      const { jobId, finished } = await startImportJob(
         db,
         { source: 'csv', csv: CSV, mapping: MAPPING, teamId: 'CORE' },
         ANA
      );
      await finished;

      // Webhook: um issue.created por linha, com id.
      const hooks = bus.webhooks.filter((e) => e.entity === 'issue' && e.action === 'created');
      expect(hooks).toHaveLength(5);
      // Nenhum `issue` pelo publish (SSE+webhook) — nem por linha, nem o coarse (#21).
      expect(bus.publish.filter((e) => e.entity === 'issue')).toHaveLength(0);
      // Coarse do time pelo canal só-SSE.
      expect(
         bus.internal.filter((e) => e.entity === 'issue' && !e.id && e.teamId === 'CORE')
      ).toHaveLength(1);
      // Aviso ao dono, endereçado.
      expect(
         bus.internal.some(
            (e) => e.entity === 'import' && e.id === jobId && e.recipientId === anaId
         )
      ).toBe(true);
      // Slack e automações (triagem) não rodam por linha.
      expect(effects.slack).toBe(0);
      expect(effects.automations).toBe(0);
   });

   it('falha de validação é síncrona (não cria job)', async () => {
      await expect(
         startImportJob(
            db,
            { source: 'csv', csv: 'ID,Title\nD,1\nD,2', mapping: MAPPING, teamId: 'CORE' },
            ANA
         )
      ).rejects.toMatchObject({ status: 400 });
   });
});
