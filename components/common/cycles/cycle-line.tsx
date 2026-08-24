'use client';

import { Cycle, cycleStatusLabel } from '@/data/cycles';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CapacityRing } from './capacity-ring';
import { CycleActions } from './cycle-actions';
import { useCycleAggregates } from './use-cycle-aggregates';

export function CyclePlayIcon({ className }: { className?: string }) {
   return (
      <svg
         width="16"
         height="16"
         viewBox="0 0 16 16"
         fill="none"
         className={cn('text-muted-foreground shrink-0', className)}
         role="img"
         focusable="false"
      >
         <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
         <path d="M6.75 5.75L10.25 8L6.75 10.25V5.75Z" fill="currentColor" />
      </svg>
   );
}

interface CycleLineProps {
   cycle: Cycle;
}

/**
 * One row of the cycles timeline. Current / upcoming cycles link to their
 * dedicated issue views ("/cycle/active" and "/cycle/upcoming").
 */
export default function CycleLine({ cycle }: CycleLineProps) {
   const { orgId } = useParams<{ orgId: string }>();

   // Agregados AO VIVO (o DTO do servidor fica stale após mover/completar issue). MAS
   // ciclo 'completed' usa o SNAPSHOT do servidor (histórico é a verdade — issues movidas
   // depois não devem reescrever o resultado final do ciclo encerrado).
   const live = useCycleAggregates(cycle.id);
   const useLive = live.ready && cycle.status !== 'completed';
   const scope = useLive ? live.scope : cycle.scope;
   const completed = useLive ? live.completed : cycle.completed;
   const successRate = useLive ? live.successRate : (cycle.successRate ?? 0);

   // Usa o time REAL do cycle (não o da URL) — robusto se a lista misturar times.
   const href =
      cycle.status === 'current'
         ? `/${orgId}/team/${cycle.teamId}/cycle/active`
         : cycle.status === 'upcoming'
           ? `/${orgId}/team/${cycle.teamId}/cycle/upcoming`
           : undefined;

   const content = (
      <div className="w-full flex items-center justify-between gap-4 px-6 h-12 hover:bg-sidebar/50 rounded-md">
         <div className="flex items-center gap-3 min-w-0">
            <CyclePlayIcon />
            <span className="text-sm font-medium truncate">{cycle.name}</span>
         </div>

         <div className="flex items-center gap-3 sm:gap-6 shrink-0">
            <span className="text-xs px-2 py-1 rounded-md bg-accent text-muted-foreground whitespace-nowrap">
               {cycleStatusLabel[cycle.status]}
            </span>

            {cycle.status === 'completed' ? (
               <>
                  <div className="hidden sm:flex items-center gap-2 w-28 justify-end">
                     <CapacityRing value={successRate} color="#6771c5" />
                     <span className="text-sm">
                        {successRate}% <span className="text-muted-foreground">success</span>
                     </span>
                  </div>
                  <span className="hidden md:inline-block text-sm w-28 text-right">
                     {completed} <span className="text-muted-foreground">completed</span>
                  </span>
               </>
            ) : (
               <div className="hidden sm:flex items-center gap-2 w-36 justify-end whitespace-nowrap">
                  <CapacityRing value={cycle.capacity} color="#6771c5" />
                  <span className="text-sm">
                     {cycle.capacity}% <span className="text-muted-foreground">of capacity</span>
                  </span>
               </div>
            )}

            <span className="text-sm w-14 sm:w-20 text-right whitespace-nowrap">
               {scope} <span className="text-muted-foreground">scope</span>
            </span>
         </div>
      </div>
   );

   return (
      <div className="w-full flex items-center pr-2">
         {href ? (
            <Link href={href} className="block flex-1 min-w-0">
               {content}
            </Link>
         ) : (
            <div className="flex-1 min-w-0">{content}</div>
         )}
         <CycleActions cycle={cycle} />
      </div>
   );
}
