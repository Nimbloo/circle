'use client';

import { NewTeamButton } from '@/components/common/teams/new-team-button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';

export default function HeaderNav() {
   const teams = useWorkspaceStore((s) => s.teams);
   return (
      <LocationBar>
         <HeaderGroup>
            <SidebarTrigger />
            <div className="flex items-center gap-1">
               <HeaderTitle>Teams</HeaderTitle>
               <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
                  {teams.length}
               </span>
            </div>
         </HeaderGroup>
         <HeaderActions>
            <NewTeamButton />
         </HeaderActions>
      </LocationBar>
   );
}
