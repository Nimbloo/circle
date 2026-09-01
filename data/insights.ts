import type { Issue } from './issues';

/**
 * Contagem status × prioridade sobre um conjunto de issues.
 *
 * Mesma regra do `issueMatrix` do servidor (`lib/api/aggregations.ts`), mas aplicada
 * ao conjunto que a TELA está exibindo — o painel de insights conta o que está
 * filtrado, e o servidor não tem como saber quais filtros estão ativos no cliente.
 * São consumidores diferentes da mesma regra, não duplicação acidental.
 *
 * Extraído do componente justamente para poder ser comparado com o servidor em
 * `test/insights-matrix-parity.test.ts` — duas implementações da mesma contagem
 * divergem em silêncio se ninguém travar.
 */
export interface IssueMatrixCounts {
   /** `[statusId][priorityId] = contagem`. Só pares com pelo menos 1 issue. */
   cells: Record<string, Record<string, number>>;
   totalsByStatus: Record<string, number>;
   totalsByPriority: Record<string, number>;
   total: number;
}

export function countIssueMatrix(issues: Issue[]): IssueMatrixCounts {
   const cells: Record<string, Record<string, number>> = {};
   const totalsByStatus: Record<string, number> = {};
   const totalsByPriority: Record<string, number> = {};

   for (const issue of issues) {
      const s = issue.status.id;
      const p = issue.priority.id;
      cells[s] ??= {};
      cells[s][p] = (cells[s][p] ?? 0) + 1;
      totalsByStatus[s] = (totalsByStatus[s] ?? 0) + 1;
      totalsByPriority[p] = (totalsByPriority[p] ?? 0) + 1;
   }

   return { cells, totalsByStatus, totalsByPriority, total: issues.length };
}
