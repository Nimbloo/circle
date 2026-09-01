'use client';

import { CreateProjectButton } from '@/components/common/projects/create-project-dialog';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';

export default function HeaderNav() {
   const projects = useWorkspaceStore((s) => s.projects);
   return (
      <LocationBar>
         <HeaderGroup>
            <SidebarTrigger />
            <div className="flex items-center gap-1">
               <HeaderTitle>Projects</HeaderTitle>
               <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
                  {projects.length}
               </span>
            </div>
         </HeaderGroup>
         <HeaderActions>
            <CreateProjectButton />
         </HeaderActions>
      </LocationBar>
   );
}
