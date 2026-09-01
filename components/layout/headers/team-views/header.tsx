'use client';

import { CreateViewButton } from '@/components/common/views/create-view-dialog';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';

export default function Header() {
   return (
      <LocationBar>
         <HeaderGroup className="pl-2.5">
            <HeaderTitle>Views</HeaderTitle>
         </HeaderGroup>
         <HeaderActions className="pr-0.5">
            <CreateViewButton label="New view" />
         </HeaderActions>
      </LocationBar>
   );
}
