'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { CycleActions } from '@/components/common/cycles/cycle-actions';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';
import { cooldownUntil, todayIso } from '@/data/cycles';
import { useWorkspaceStore } from '@/store/workspace-store';
import { format, parseISO } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { CycleView } from '@/components/common/issues/cycle-issues';

export default function HeaderNav({ cycleView }: { cycleView: CycleView }) {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const cycle = useWorkspaceStore((s) =>
      cycleView === 'active' ? s.getCurrentCycle(teamId) : s.getUpcomingCycle(teamId)
   );
   const allCycles = useWorkspaceStore((s) => s.cycles);
   // Cool-down (#24): sem cycle current, o header do cycle ativo mostra até quando.
   const until = useMemo(
      () =>
         cycleView === 'active' && !cycle
            ? cooldownUntil(
                 allCycles.filter((c) => c.teamId === teamId),
                 todayIso()
              )
            : null,
      [cycleView, cycle, allCycles, teamId]
   );
   const team = teams.find((t) => t.id === teamId) ?? teams[0];
   if (!team) return <LocationBar />;

   return (
      <LocationBar>
         <HeaderGroup>
            <Link
               href={`/${orgId}/team/${team.id}/overview`}
               className="flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
               <div className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0 text-xs">
                  {team.icon}
               </div>
               <span className="truncate text-[13px]">{team.name}</span>
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
            <Link
               href={`/${orgId}/team/${team.id}/cycles`}
               className="text-[13px] text-muted-foreground hover:text-foreground"
            >
               Cycles
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
               <CyclePlayIcon className="size-3.5" />
               <HeaderTitle>
                  {cycle?.name ??
                     (until ? `Cool-down até ${format(parseISO(until), 'MMM d')}` : '')}
               </HeaderTitle>
            </div>
         </HeaderGroup>
         {cycle && (
            <HeaderActions>
               <CycleActions cycle={cycle} />
            </HeaderActions>
         )}
      </LocationBar>
   );
}
