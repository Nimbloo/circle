'use client';

import { cooldownUntil, todayIso } from '@/data/cycles';
import { useWorkspaceStore } from '@/store/workspace-store';
import { format, parseISO } from 'date-fns';
import { Hourglass } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import CycleLine, { CyclePlayIcon } from './cycle-line';
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
   const allCycles = useWorkspaceStore((state) => state.cycles);
   const cycles = useMemo(() => {
      const teamCycles = teamId ? allCycles.filter((cycle) => cycle.teamId === teamId) : allCycles;
      return [...teamCycles].sort((a, b) => b.startDate.localeCompare(a.startDate));
   }, [allCycles, teamId]);

   // Cool-down (#24): sem cycle current entre o último completed e o próximo upcoming.
   // A linha entra na timeline (newest first) logo antes do primeiro cycle já encerrado.
   const until = useMemo(() => cooldownUntil(cycles, todayIso()), [cycles]);
   const cooldownBefore = until ? cycles.findIndex((c) => c.startDate < until) : -1;

   if (cycles.length === 0) {
      return (
         <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
               <CyclePlayIcon className="size-6" />
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
      <div className="w-full">
         {cycles.map((cycle, idx) => (
            <div key={cycle.id} className="flex w-full flex-col">
               {idx === cooldownBefore && until && (
                  <div className="flex w-full items-stretch">
                     <div className="relative w-14 shrink-0 sm:w-[126px]">
                        <div className="absolute bottom-0 left-[27.5px] top-0 w-px bg-border sm:left-[73.5px]" />
                     </div>
                     <div className="flex min-w-0 flex-1 items-center gap-4 py-4 text-[13px] leading-4 text-muted-foreground">
                        <Hourglass className="size-4 shrink-0" />
                        <span>Cool-down até {format(parseISO(until), 'MMM d')}</span>
                     </div>
                  </div>
               )}
               <div className="flex w-full items-stretch">
                  <div className="relative w-14 shrink-0 sm:w-[126px]">
                     <div className="absolute bottom-[4.5px] left-[27.5px] top-0 w-px bg-border sm:left-[73.5px]" />
                     <span className="absolute -bottom-4 left-0 hidden w-[63px] text-right text-xs font-[450] leading-[15px] text-muted-foreground sm:block">
                        {format(parseISO(cycle.startDate), 'MMM')}
                        <br />
                        {format(parseISO(cycle.startDate), 'd')}
                     </span>
                     <span
                        className={
                           'absolute -bottom-[4.5px] left-[23.5px] z-10 size-[9px] rounded-full border-2 bg-background sm:left-[69.5px] ' +
                           (cycle.status === 'current'
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/40')
                        }
                     />
                  </div>

                  <div className="min-w-0 flex-1 border-b border-border/60">
                     <CycleLine cycle={cycle} />

                     {cycle.status === 'current' && (
                        <div className="-mt-4 mb-4 flex h-[216px] items-stretch gap-5 px-2.5 xl:pr-[60px]">
                           <div className="min-w-0 flex-1">
                              <CycleBurnupChart cycle={cycle} height={216} />
                           </div>
                           <div className="hidden w-[300px] shrink-0 items-center xl:flex">
                              <CycleProgressLegend cycle={cycle} />
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>
         ))}
      </div>
   );
}
