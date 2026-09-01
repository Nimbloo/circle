'use client';

import { CreateViewButton } from '@/components/common/views/create-view-dialog';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';

export default function Header() {
   return (
      <LocationBar>
         <HeaderGroup>
            <SidebarTrigger />
            <HeaderTitle>Views</HeaderTitle>
         </HeaderGroup>
         <HeaderActions>
            <CreateViewButton />
         </HeaderActions>
      </LocationBar>
   );
}
