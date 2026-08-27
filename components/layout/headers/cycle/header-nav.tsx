'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useWorkspaceStore } from '@/store/workspace-store';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CycleView } from '@/components/common/issues/cycle-issues';
import { CycleActions } from '@/components/common/cycles/cycle-actions';

export default function HeaderNav({ cycleView }: { cycleView: CycleView }) {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const cycle = useWorkspaceStore((s) =>
      cycleView === 'active' ? s.getCurrentCycle(teamId) : s.getUpcomingCycle(teamId)
   );
   const team = teams.find((t) => t.id === teamId) ?? teams[0];
   if (!team) return <div className="w-full border-b h-10" />; // store não hidratou → evita crash

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger />
            <Link
               href={`/${orgId}/team/${team.id}/overview`}
               className="flex items-center gap-1.5 min-w-0 hover:opacity-80"
            >
               <div className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0 text-xs">
                  {team.icon}
               </div>
               <span className="text-sm font-medium truncate">{team.name}</span>
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
            <Link
               href={`/${orgId}/team/${team.id}/cycles`}
               className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
               Cycles
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
               <CyclePlayIcon className="size-3.5" />
               <span className="text-sm font-medium truncate">{cycle?.name}</span>
            </div>
            {cycle && <CycleActions cycle={cycle} />}
         </div>
      </div>
   );
}
