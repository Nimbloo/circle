'use client';

import type { Issue } from '@/data/issues';
import { cn } from '@/lib/utils';
import { SLA_STATE_LABEL, slaState, type SlaState } from '@/lib/sla';
import { AlertTriangle, TimerOff } from 'lucide-react';

/**
 * Indicador de SLA (#97) na linha e no card: "SLA at risk" (âmbar, resta menos de 25%
 * do prazo) e "SLA breached" (destrutivo, prazo vencido). Nada é renderizado quando a
 * issue não tem SLA aplicado, ou já está concluída/cancelada.
 */
export function slaStateOf(issue: Issue, now?: Date): SlaState {
   return slaState(
      {
         dueDate: issue.dueDate ?? null,
         slaAppliedAt: issue.slaAppliedAt ?? null,
         statusCategory: issue.status.category,
      },
      now
   );
}

export function SlaBadge({ issue, compact = false }: { issue: Issue; compact?: boolean }) {
   const state = slaStateOf(issue);
   if (state === 'none' || state === 'ok') return null;
   const breached = state === 'breached';
   const Icon = breached ? TimerOff : AlertTriangle;
   const label = SLA_STATE_LABEL[state];
   return (
      <span
         title={label}
         aria-label={label}
         className={cn(
            'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium',
            breached ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
         )}
      >
         <Icon className="size-3" />
         {compact ? null : <span className="max-lg:hidden">{label}</span>}
      </span>
   );
}
