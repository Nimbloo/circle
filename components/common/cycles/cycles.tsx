'use client';

import { useWorkspaceStore } from '@/store/workspace-store';
import { format, parseISO } from 'date-fns';
import { IterationCcw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Fragment, useMemo } from 'react';
import CycleLine from './cycle-line';
import { CycleBurnupChart, CycleProgressLegend } from './cycle-burnup-chart';

/**
 * Cycles timeline: a date rail on the left and one row per cycle,
 * newest first. The current cycle is expanded with its burn-up chart.
 *
 * A rota é team-scoped (/team/[teamId]/cycles) → filtra os cycles pelo time da URL.
 * Sem isto a página mostrava os cycles de TODOS os times misturados, com links
 * apontando para o time errado.
 */
export default function Cycles() {
   const { teamId } = useParams<{ teamId?: string }>();
   const allCycles = useWorkspaceStore((s) => s.cycles);
   const cycles = useMemo(
      () => (teamId ? allCycles.filter((c) => c.teamId === teamId) : allCycles),
      [allCycles, teamId]
   );

   if (cycles.length === 0) {
      return (
         <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
               <IterationCcw className="size-6" />
            </div>
            <div className="flex flex-col gap-1">
               <p className="text-sm font-medium">No cycles yet</p>
               <p className="max-w-xs text-sm text-muted-foreground">
                  Cycles focus your team over short, time-boxed windows. They show up here once a
                  team turns them on.
               </p>
            </div>
         </div>
      );
   }

   return (
      <div className="w-full py-4">
         {cycles.map((cycle) => (
            <Fragment key={cycle.id}>
               <div className="w-full flex items-stretch">
                  {/* Date rail */}
                  <div className="relative w-14 sm:w-20 shrink-0 flex flex-col items-end pr-4">
                     {/* Vertical rail, centered on the dots (pr-4 = 16px + half dot 5px - half line) */}
                     <div className="absolute right-[20.5px] top-0 bottom-0 w-px bg-border" />
                     <div className="flex items-center gap-2 h-12">
                        <span className="text-[11px] leading-tight text-muted-foreground text-right">
                           {format(parseISO(cycle.startDate), 'MMM')}
                           <br />
                           {format(parseISO(cycle.startDate), 'd')}
                        </span>
                        <span
                           className={
                              'relative z-10 size-2.5 rounded-full border-2 bg-background ' +
                              (cycle.status === 'current'
                                 ? 'border-indigo-400 bg-indigo-400'
                                 : 'border-muted-foreground/40')
                           }
                        />
                     </div>
                  </div>

                  {/* Cycle row + expanded chart for the current cycle */}
                  <div className="flex-1 min-w-0 border-b border-border/60">
                     <CycleLine cycle={cycle} />

                     {cycle.status === 'current' && (
                        <div className="flex flex-col lg:flex-row items-stretch gap-8 px-6 pb-6 pt-2">
                           <div className="flex-1 min-w-0">
                              <CycleBurnupChart cycle={cycle} height={220} />
                           </div>
                           <div className="lg:w-64 shrink-0 flex items-center">
                              <CycleProgressLegend cycle={cycle} />
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </Fragment>
         ))}
      </div>
   );
}
