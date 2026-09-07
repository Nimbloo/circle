'use client';

import { Cycle } from '@/data/cycles';

/**
 * Legenda do burn-up. Vive FORA do `cycle-burnup-chart` de propósito: aquele módulo
 * importa recharts (357 KB no bundle), e quem só quer a legenda pagaria a biblioteca
 * inteira junto, mesmo sem renderizar gráfico nenhum.
 */
const COLORS = {
   scope: 'var(--muted-foreground)',
   started: 'var(--cycle-started)',
   completed: 'var(--primary)',
};

export function CycleProgressLegend({ cycle }: { cycle: Cycle }) {
   const completedPercent = cycle.scope > 0 ? Math.round((cycle.completed / cycle.scope) * 100) : 0;
   const startedPercent = cycle.scope > 0 ? Math.round((cycle.started / cycle.scope) * 100) : 0;

   const rows = [
      {
         key: 'scope',
         label: 'Scope',
         swatch: COLORS.scope,
         value: cycle.scope,
         extra:
            cycle.scopeDelta !== 0
               ? `${cycle.scopeDelta > 0 ? '+' : ''}${cycle.scopeDelta}%`
               : undefined,
         extraClass: 'text-destructive',
      },
      {
         key: 'started',
         label: 'Started',
         swatch: COLORS.started,
         value: cycle.started,
         extra: `${startedPercent}%`,
         extraClass: 'text-muted-foreground',
      },
      {
         key: 'completed',
         label: 'Completed',
         swatch: COLORS.completed,
         value: cycle.completed,
         extra: `${completedPercent}%`,
         extraClass: 'text-muted-foreground',
      },
   ];

   return (
      <div className="flex w-full flex-col divide-y divide-border/60">
         {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-6 py-3.5">
               <div className="flex items-center gap-3">
                  <span
                     className="size-2 rounded-[2px]"
                     style={{ backgroundColor: row.swatch }}
                     aria-hidden="true"
                  />
                  <span className="text-[13px] font-[450] leading-4 text-muted-foreground">
                     {row.label}
                  </span>
               </div>
               <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium">{row.value}</span>
                  {row.extra && <span className={`text-xs ${row.extraClass}`}>• {row.extra}</span>}
               </div>
            </div>
         ))}
      </div>
   );
}
