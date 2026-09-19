import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { ensureImportJobTable } from './helpers/import-job-table';
import { __setTestDb, type Db } from '@/db';
import { POST as commitRoute } from '@/app/api/v1/import/commit/route';
import { GET as jobRoute } from '@/app/api/v1/import/jobs/[id]/route';

/**
 * #10 (contrato decidido): `POST /import/commit` devolve `{ jobId }` na hora e
 * `GET /import/jobs/:id` mostra progresso/resultado — só para o dono.
 */
const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';
let db: Db;

function req(url: string, email: string, init: RequestInit = {}) {
   return new Request(url, {
      ...init,
      headers: { 'x-forwarded-email': email, 'content-type': 'application/json' },
   });
}

beforeEach(async () => {
   db = await makeTestDb();
   await ensureImportJobTable(db);
   __setTestDb(db);
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin', teamIds: ['CORE'] });
   await seedUser(db, { name: 'Bob', email: BOB, teamIds: ['CORE'] });
});
afterEach(() => __setTestDb(null));

async function waitDone(jobId: string) {
   for (let i = 0; i < 200; i++) {
      const res = await jobRoute(req('http://x/api/v1/import/jobs/' + jobId, ANA), {
         params: Promise.resolve({ id: jobId }),
      });
      const job = (await res.json()).data;
      if (job.status === 'succeeded' || job.status === 'failed') return job;
      await new Promise((r) => setTimeout(r, 25));
   }
   throw new Error('job não terminou');
}

describe('rotas do import em background (#10)', () => {
   it('commit devolve jobId e o job conclui com o resumo', async () => {
      const res = await commitRoute(
         req('http://x/api/v1/import/commit', ANA, {
            method: 'POST',
            body: JSON.stringify({
               source: 'csv',
               csv: 'ID,Title\nA-1,Um\nA-2,Dois',
               teamId: 'CORE',
               mapping: { externalId: 'ID', title: 'Title' },
            }),
         })
      );
      expect(res.status).toBe(200);
      const { jobId } = (await res.json()).data;
      expect(typeof jobId).toBe('string');

      const job = await waitDone(jobId);
      expect(job).toMatchObject({ status: 'succeeded', total: 2, processed: 2, created: 2 });

      const other = await jobRoute(req('http://x/api/v1/import/jobs/' + jobId, BOB), {
         params: Promise.resolve({ id: jobId }),
      });
      expect(other.status).toBe(404);
   });

   it('CSV com externalId duplicado falha na hora (#24), sem job', async () => {
      const res = await commitRoute(
         req('http://x/api/v1/import/commit', ANA, {
            method: 'POST',
            body: JSON.stringify({
               source: 'csv',
               csv: 'ID,Title\nD,Um\nD,Dois',
               teamId: 'CORE',
               mapping: { externalId: 'ID', title: 'Title' },
            }),
         })
      );
      expect(res.status).toBe(400);
   });
});
