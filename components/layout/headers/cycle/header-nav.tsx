'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { HeaderGroup, HeaderTitle, LocationBar } from '@/components/layout/header-primitives';
import { useWorkspaceStore } from '@/store/workspace-store';
import { ChevronRight, MoreHorizontal, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CycleView } from '@/components/common/issues/cycle-issues';

export default function HeaderNav({ cycleView }: { cycleView: CycleView }) {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const cycle = useWorkspaceStore((s) =>
      cycleView === 'active' ? s.getCurrentCycle(teamId) : s.getUpcomingCycle(teamId)
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
               <HeaderTitle>{cycle?.name}</HeaderTitle>
            </div>
            <Star className="size-3.5 text-muted-foreground shrink-0 ml-1" />
            <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
         </HeaderGroup>
      </LocationBar>
   );
}
