'use client';

import { InvitePanel } from '@/components/common/members/invite-panel';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';
import { Filter } from './filter';

export default function HeaderNav() {
   const users = useWorkspaceStore((s) => s.users);
   return (
      <LocationBar>
         <HeaderGroup className="gap-2 pl-2.5">
            <HeaderTitle>Members</HeaderTitle>
            <span className="text-xs font-[450] leading-[normal] text-muted-foreground">
               {users.length}
            </span>
         </HeaderGroup>
         <HeaderActions className="gap-1.5 pr-0.5">
            <Filter />
            <InvitePanel />
         </HeaderActions>
      </LocationBar>
   );
}
