'use client';

import { CreateProjectButton } from '@/components/common/projects/create-project-dialog';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';

export default function HeaderNav() {
   return (
      <LocationBar>
         <HeaderGroup>
            <SidebarTrigger />
            <HeaderTitle>Projects</HeaderTitle>
         </HeaderGroup>
         <HeaderActions>
            <CreateProjectButton />
         </HeaderActions>
      </LocationBar>
   );
}
