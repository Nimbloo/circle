/**
 * SLA por prioridade (#97) — lógica PURA, compartilhada entre servidor (aplicação do
 * prazo em `lib/api/slas.ts`) e UI (indicadores na linha/card e filtro).
 *
 * O prazo do SLA é gravado no `due_date` da issue (coluna `date`, sem hora) e a marca
 * `sla_applied_at` guarda QUANDO ele foi calculado. Como o `due_date` não tem hora, o
 * vencimento é o FIM do dia (23:59:59.999 UTC) — mesma convenção do resto do produto,
 * onde uma issue com due date "hoje" só atrasa quando o dia acaba.
 */

/** Estado do SLA de uma issue. `none` = sem SLA aplicado (ou já concluída/cancelada). */
export type SlaState = 'none' | 'ok' | 'at-risk' | 'breached';

/** Fração do prazo restante abaixo da qual a issue entra em "at risk". */
export const SLA_AT_RISK_FRACTION = 0.25;

export interface SlaInput {
   dueDate?: string | null;
   slaAppliedAt?: string | null;
   statusCategory?: string;
}

/** Fim do dia (UTC) de um `due_date` (`YYYY-MM-DD`); null se a data for inválida. */
export function slaDeadline(dueDate: string | null | undefined): number | null {
   if (!dueDate) return null;
   const ms = Date.parse(`${dueDate.slice(0, 10)}T23:59:59.999Z`);
   return Number.isNaN(ms) ? null : ms;
}

/** `due_date` (YYYY-MM-DD, UTC) para um SLA de `hours` horas contado a partir de `from`. */
export function slaDueDate(from: Date, hours: number): string {
   return new Date(from.getTime() + hours * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Estado do SLA: `breached` quando o prazo venceu e a issue não foi concluída/cancelada;
 * `at-risk` quando resta menos de 25% da janela; `none` sem SLA aplicado.
 */
export function slaState(issue: SlaInput, now: Date = new Date()): SlaState {
   if (!issue.slaAppliedAt) return 'none';
   if (issue.statusCategory === 'completed' || issue.statusCategory === 'canceled') return 'none';
   const deadline = slaDeadline(issue.dueDate);
   const start = Date.parse(issue.slaAppliedAt);
   if (deadline === null || Number.isNaN(start)) return 'none';
   const current = now.getTime();
   if (current > deadline) return 'breached';
   const total = deadline - start;
   if (total <= 0) return 'at-risk';
   return (deadline - current) / total < SLA_AT_RISK_FRACTION ? 'at-risk' : 'ok';
}

/** Rótulo curto do indicador (linha, card e filtro). */
export const SLA_STATE_LABEL: Record<Exclude<SlaState, 'none'>, string> = {
   'ok': 'SLA on track',
   'at-risk': 'SLA at risk',
   'breached': 'SLA breached',
};
