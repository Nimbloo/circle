'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { useWorkspaceStore } from '@/store/workspace-store';
import { HeaderGroup, HeaderTitle, LocationBar } from '@/components/layout/header-primitives';

export default function HeaderNav() {
   const users = useWorkspaceStore((s) => s.users);
   return (
      <LocationBar>
         <HeaderGroup>
            <SidebarTrigger />
            <div className="flex items-center gap-1">
               <HeaderTitle>Members</HeaderTitle>
               <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
                  {users.length}
               </span>
            </div>
         </HeaderGroup>
      </LocationBar>
   );
}
