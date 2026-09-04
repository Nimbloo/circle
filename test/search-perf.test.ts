import { describe, it, expect, beforeAll } from 'vitest';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { issue, issueContent } from '@/db/schema';
import { search } from '@/lib/api/search';

/**
 * Medição de tempo da busca com volume (meta da spec: < 300 ms com 10k issues; aqui
 * 2k, que já é representativo e cabe no PGlite). Sem assert de duração — o número do
 * WASM numa máquina de CI não é comparável ao Postgres real e viraria teste frágil.
 * Só registra o tempo no log e garante que o resultado continua correto.
 */

const TOTAL = 2000;
let db: Db;

beforeAll(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const ownerId = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
   const now = new Date('2026-01-01T00:00:00Z');

   const words = ['deploy', 'cache', 'fila', 'métrica', 'sessão', 'webhook', 'ícone', 'rollback'];
   const issues = [];
   const contents = [];
   for (let i = 0; i < TOTAL; i++) {
      const id = `i-${i}`;
      issues.push({
         id,
         identifier: `CORE-${i}`,
         teamId: 'CORE',
         title: `${words[i % words.length]} ${words[(i + 3) % words.length]} número ${i}`,
         statusId: 'in-progress',
         priorityId: 'high',
         assigneeId: null,
         createdById: ownerId,
         projectId: null,
         cycleId: null,
         rank: id,
         createdAt: now,
         updatedAt: now,
      });
      contents.push({
         issueId: id,
         description: `corpo com ${words[(i + 5) % words.length]} e detalhes diversos da issue ${i}`,
      });
   }
   // A agulha: único documento com o termo raro.
   issues[1234].title = 'Falha rara de telemetria distribuída';

   for (let i = 0; i < issues.length; i += 200) {
      await db.insert(issue).values(issues.slice(i, i + 200));
      await db.insert(issueContent).values(contents.slice(i, i + 200));
   }
}, 180_000);

describe(`search — tempo com ${TOTAL} issues`, () => {
   it('acha o termo raro e registra a duração', async () => {
      // Descarta a 1ª execução (aquecimento do plano/cache do PGlite).
      await search(db, { q: 'telemetria', types: ['issue'] });

      const started = performance.now();
      const res = await search(db, { q: 'telemetria', types: ['issue'] });
      const ms = performance.now() - started;
      console.log(`[search-perf] termo raro em ${TOTAL} issues: ${ms.toFixed(1)} ms`);

      expect(res.fallback).toBe(false);
      expect(res.groups[0].items.map((i) => i.id)).toEqual(['i-1234']);
   });

   it('termo comum (muitos acertos) também é medido', async () => {
      await search(db, { q: 'deploy', types: ['issue'] });

      const started = performance.now();
      const res = await search(db, { q: 'deploy', types: ['issue'], limit: 20 });
      const ms = performance.now() - started;
      console.log(`[search-perf] termo comum em ${TOTAL} issues: ${ms.toFixed(1)} ms`);

      expect(res.groups[0].items).toHaveLength(20);
   });
});
