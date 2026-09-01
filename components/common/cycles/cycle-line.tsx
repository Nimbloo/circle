'use client';

import { Cycle, cycleStatusLabel } from '@/data/cycles';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CapacityRing } from './capacity-ring';
import { CycleActions } from './cycle-actions';

export function CyclePlayIcon({ className }: { className?: string }) {
   return (
      <svg
         width="16"
         height="16"
         viewBox="0 0 16 16"
         fill="none"
         className={cn('shrink-0 text-muted-foreground', className)}
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

/** One row of the cycles timeline. */
export default function CycleLine({ cycle }: CycleLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const href =
      cycle.status === 'current'
         ? `/${orgId}/team/${cycle.teamId}/cycle/active`
         : cycle.status === 'upcoming'
           ? `/${orgId}/team/${cycle.teamId}/cycle/upcoming`
           : undefined;

   const content = (
      <>
         <div className="flex min-w-0 items-center gap-4">
            <CyclePlayIcon />
            <span className="truncate text-[13px] font-medium leading-4">{cycle.name}</span>
         </div>
         <span className="hidden whitespace-nowrap pl-1.5 text-[13px] font-[450] leading-4 text-muted-foreground sm:block">
            {cycleStatusLabel[cycle.status]}
         </span>

         {cycle.status === 'completed' ? (
            <>
               <div className="hidden items-center gap-2 whitespace-nowrap text-[13px] leading-4 xl:flex">
                  <CapacityRing value={cycle.successRate ?? 0} />
                  <span className="font-medium">{cycle.successRate ?? 0}%</span>
                  <span className="text-muted-foreground">success</span>
               </div>
               <div className="hidden items-center gap-1 whitespace-nowrap text-[13px] leading-4 xl:flex">
                  <span className="font-medium">{cycle.completed}</span>
                  <span className="text-muted-foreground">completed</span>
               </div>
            </>
         ) : (
            <div className="hidden items-center gap-2 whitespace-nowrap text-[13px] leading-4 xl:flex">
               <CapacityRing value={cycle.capacity} />
               <span className="font-medium">{cycle.capacity}%</span>
               <span className="text-muted-foreground">of capacity</span>
            </div>
         )}

         <span className="hidden items-center gap-1 whitespace-nowrap text-[13px] leading-4 sm:flex">
            <span className="font-medium">{cycle.scope}</span>
            <span className="text-muted-foreground">scope</span>
         </span>
      </>
   );

   return (
      <div
         className={cn(
            'relative grid h-[70px] w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-x-3 transition-colors hover:bg-sidebar/50 sm:grid-cols-[minmax(0,1fr)_75px_60px_44px]',
            cycle.status === 'completed'
               ? 'xl:grid-cols-[minmax(0,1fr)_80px_110px_84px_60px_44px]'
               : 'xl:grid-cols-[minmax(0,1fr)_75px_142px_60px_44px]'
         )}
      >
         {href && (
            <Link
               href={href}
               aria-label={`Open ${cycle.name}`}
               className="absolute inset-y-0 left-0 right-14 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
         )}
         {content}
         <div className="relative z-10 flex size-11 items-center justify-center">
            <CycleActions cycle={cycle} />
         </div>
      </div>
   );
}
