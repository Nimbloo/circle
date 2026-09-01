'use client';

import { CreateProjectButton } from '@/components/common/projects/create-project-dialog';
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
            <HeaderTitle>Projects</HeaderTitle>
         </HeaderGroup>
         <HeaderActions>
            <CreateProjectButton />
         </HeaderActions>
      </LocationBar>
   );
}
