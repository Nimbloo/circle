'use client';

import { NewTeamButton } from '@/components/common/teams/new-team-button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useWorkspaceStore } from '@/store/workspace-store';

export default function HeaderNav() {
   const teams = useWorkspaceStore((s) => s.teams);
   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger className="" />
            <div className="flex items-center gap-1">
               <span className="text-sm font-medium">Teams</span>
               <span className="text-xs bg-accent rounded-md px-1.5 py-1">{teams.length}</span>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <NewTeamButton />
         </div>
      </div>
   );
}
