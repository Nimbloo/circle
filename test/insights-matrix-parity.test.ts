import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue, listIssues } from '@/lib/api/issues';
import { issueMatrix } from '@/lib/api/aggregations';
import { adaptIssues } from '@/lib/adapters';
import { countIssueMatrix } from '@/data/insights';

/**
 * PARIDADE DA MATRIZ STATUS × PRIORIDADE.
 *
 * `issueMatrix` (servidor, `GET /issues/aggregate`) e `countIssueMatrix` (cliente, usado
 * pelo painel de insights) contam a mesma coisa por caminhos diferentes: o servidor
 * agrega com `GROUP BY` no Postgres, o cliente conta em memória sobre as issues que a
 * tela exibe.
 *
 * Os consumidores são distintos de propósito — o painel conta o que está FILTRADO, e o
 * servidor não conhece os filtros do cliente. Mas a REGRA tem que ser a mesma: sobre o
 * mesmo conjunto, os números precisam bater. Foi assim que o filtro de views divergiu
 * antes (ver `view-filter-parity.test.ts`).
 */

const ME = 'ana@nimbloo.ai';

describe('paridade da matriz de insights (servidor x cliente)', () => {
   it('mesmos cells e totais sobre o mesmo conjunto de issues', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await seedUser(db, { name: 'Ana', email: ME, teamIds: ['CORE'] });

      const combos: [string, string][] = [
         ['in-progress', 'high'],
         ['in-progress', 'high'],
         ['in-progress', 'low'],
         ['to-do', 'high'],
         ['to-do', 'urgent'],
         ['done', 'low'],
      ];
      for (const [statusId, priorityId] of combos) {
         await createIssue(
            db,
            { teamId: 'CORE', title: `${statusId}-${priorityId}`, statusId, priorityId },
            ME
         );
      }

      const server = await issueMatrix(db);
      const client = countIssueMatrix(adaptIssues(await listIssues(db, {})));

      expect(client.total).toBe(server.total);
      expect(client.totalsByStatus).toEqual(server.totalsByStatus);
      expect(client.totalsByPriority).toEqual(server.totalsByPriority);

      // O servidor pre-inicializa `cells[statusId] = {}` para TODO status do catálogo;
      // o cliente só cria a chave quando há issue. Comparação par a par evita comparar
      // buckets vazios que não representam divergência de contagem.
      for (const [statusId, byPriority] of Object.entries(server.cells)) {
         for (const [priorityId, n] of Object.entries(byPriority)) {
            expect(client.cells[statusId]?.[priorityId] ?? 0, `${statusId}/${priorityId}`).toBe(n);
         }
      }
      for (const [statusId, byPriority] of Object.entries(client.cells)) {
         for (const [priorityId, n] of Object.entries(byPriority)) {
            expect(server.cells[statusId]?.[priorityId] ?? 0, `${statusId}/${priorityId}`).toBe(n);
         }
      }
   });

   it('conjunto vazio nao inventa contagem', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');

      const server = await issueMatrix(db);
      const client = countIssueMatrix([]);

      expect(client.total).toBe(server.total);
      expect(client.totalsByStatus).toEqual(server.totalsByStatus);
   });
});
