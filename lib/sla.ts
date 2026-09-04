/**
 * SLA por prioridade (#97) — lógica PURA, compartilhada entre servidor (aplicação do
 * prazo em `lib/api/slas.ts`) e UI (indicadores na linha/card e filtro).
 *
 * O vencimento REAL é `issue.sla_due_at` (timestamp, com hora); `due_date` continua
 * sendo a data humana mostrada na UI, derivada dele. Antes desta correção o prazo
 * morava só no `due_date` (`date`, sem hora) e o vencimento era o fim do dia UTC —
 * aplicados às 09:00, SLAs de 1 h, 2 h, 4 h, 8 h e 12 h davam TODOS o mesmo prazo, e
 * às 22:00 um SLA de 4 h virava 26 h (não-monotônico).
 *
 * Linhas anteriores à migration `0046_sla_due_at` (e prioridades sem SLA contratado)
 * não têm `slaDueAt`: para elas vale o fallback do fim do dia, exatamente a semântica
 * antiga — nenhum indicador muda de estado por causa da migration.
 */

/** Estado do SLA de uma issue. `none` = sem SLA aplicado (ou já concluída/cancelada). */
export type SlaState = 'none' | 'ok' | 'at-risk' | 'breached';

/** Fração do prazo restante abaixo da qual a issue entra em "at risk". */
export const SLA_AT_RISK_FRACTION = 0.25;

export interface SlaInput {
   dueDate?: string | null;
   /** Vencimento real do SLA (ISO). Ausente = linha antiga → fim do dia do `dueDate`. */
   slaDueAt?: string | null;
   slaAppliedAt?: string | null;
   statusCategory?: string;
}

/** Fim do dia (UTC) de um `due_date` (`YYYY-MM-DD`); null se a data for inválida. */
function endOfDay(dueDate: string | null | undefined): number | null {
   if (!dueDate) return null;
   const ms = Date.parse(`${dueDate.slice(0, 10)}T23:59:59.999Z`);
   return Number.isNaN(ms) ? null : ms;
}

/**
 * Vencimento do SLA em ms: o timestamp real quando existe, senão o fim do dia do
 * `due_date` (compatibilidade com as linhas anteriores à migration). null = sem prazo.
 */
export function slaDeadline(issue: SlaInput): number | null {
   if (issue.slaDueAt) {
      const ms = Date.parse(issue.slaDueAt);
      if (!Number.isNaN(ms)) return ms;
   }
   return endOfDay(issue.dueDate);
}

/** Vencimento de um SLA de `hours` horas contado a partir de `from`. */
export function slaDueAt(from: Date, hours: number): Date {
   return new Date(from.getTime() + hours * 3_600_000);
}

/** `due_date` (YYYY-MM-DD, UTC) correspondente ao vencimento — a data humana da UI. */
export function slaDueDate(from: Date, hours: number): string {
   return slaDueAt(from, hours).toISOString().slice(0, 10);
}

/**
 * Estado do SLA: `breached` quando o prazo venceu e a issue não foi concluída/cancelada;
 * `at-risk` quando resta menos de 25% da janela; `none` sem SLA aplicado.
 *
 * A janela é `vencimento − aplicação`, que com o `slaDueAt` é EXATAMENTE a janela
 * contratada (25% de 4 h = a última hora). Com o fallback de fim de dia ela continua
 * sendo a arredondada, como antes.
 */
export function slaState(issue: SlaInput, now: Date = new Date()): SlaState {
   if (!issue.slaAppliedAt) return 'none';
   if (issue.statusCategory === 'completed' || issue.statusCategory === 'canceled') return 'none';
   const deadline = slaDeadline(issue);
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
