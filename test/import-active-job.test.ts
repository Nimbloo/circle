import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { importJob } from '@/db/schema';
import { getActiveImportJob, IMPORT_JOB_STALE_MS } from '@/lib/api/import';
import { GET as activeRoute } from '@/app/api/v1/import/jobs/route';
import { getOrCreateUser } from '@/lib/api/users';

/**
 * ad#5 — sair da tela de import perdia o progresso: não havia como achar o job em
 * andamento. `GET /import/jobs` devolve o job ativo do dono (ou null).
 */
const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';
let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin', teamIds: ['CORE'] });
   await seedUser(db, { name: 'Bob', email: BOB, teamIds: ['CORE'] });
});
afterEach(() => __setTestDb(null));

async function seedJob(email: string, over: Partial<typeof importJob.$inferInsert> = {}) {
   const owner = await getOrCreateUser(db, email);
   const id = `job-${Math.random().toString(16).slice(2)}`;
   await db.insert(importJob).values({
      id,
      ownerId: owner.id,
      teamId: 'CORE',
      source: 'csv',
      status: 'running',
      total: 10,
      processed: 3,
      ...over,
   });
   return id;
}

describe('job de import ativo (ad#5)', () => {
   it('devolve o job em andamento do dono e ignora o dos outros', async () => {
      const mine = await seedJob(ANA);
      await seedJob(BOB);
      const ana = await getOrCreateUser(db, ANA);
      expect((await getActiveImportJob(db, ana.id))?.id).toBe(mine);
   });

   it('job concluído ou travado não é "ativo"', async () => {
      const ana = await getOrCreateUser(db, ANA);
      await seedJob(ANA, { status: 'succeeded', finishedAt: new Date() });
      expect(await getActiveImportJob(db, ana.id)).toBeNull();
      await seedJob(ANA, {
         status: 'running',
         updatedAt: new Date(Date.now() - IMPORT_JOB_STALE_MS - 1000),
      });
      expect(await getActiveImportJob(db, ana.id)).toBeNull();
   });

   it('a rota devolve o job ativo, ou null quando não há', async () => {
      const req = (email: string) =>
         new Request('http://x/api/v1/import/jobs', { headers: { 'x-forwarded-email': email } });
      const vazio = await activeRoute(req(ANA));
      expect(vazio.status).toBe(200);
      expect((await vazio.json()).data).toBeNull();

      const id = await seedJob(ANA);
      const res = await activeRoute(req(ANA));
      expect((await res.json()).data.id).toBe(id);
   });
});
