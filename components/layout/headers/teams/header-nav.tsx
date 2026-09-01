'use client';

import { NewTeamButton } from '@/components/common/teams/new-team-button';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';

export default function HeaderNav() {
   return (
      <LocationBar>
         <HeaderGroup className="pl-2.5">
            <HeaderTitle>Teams</HeaderTitle>
         </HeaderGroup>
         <HeaderActions className="pr-0.5">
            <NewTeamButton />
         </HeaderActions>
      </LocationBar>
   );
}
