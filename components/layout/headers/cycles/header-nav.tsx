'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';
import { CreateCycleButton } from '@/components/common/cycles/create-cycle-dialog';
import { useWorkspaceStore } from '@/store/workspace-store';
import { ChevronRight, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function HeaderNav() {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const team = teams.find((t) => t.id === teamId) ?? teams[0];
   if (!team) return <LocationBar />;

   return (
      <LocationBar>
         <HeaderGroup>
            <SidebarTrigger />
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
            <HeaderTitle>Cycles</HeaderTitle>
            <Star className="size-3.5 text-muted-foreground shrink-0 ml-1" />
         </HeaderGroup>
         <HeaderActions>
            <CreateCycleButton defaultTeamId={team.id} />
         </HeaderActions>
      </LocationBar>
   );
}
