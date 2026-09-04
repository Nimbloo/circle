'use client';

import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
   ViewBar,
} from '@/components/layout/header-primitives';
import { RoadmapDisplayOptions } from '@/components/common/roadmap/roadmap-display-options';

export default function Header() {
   return (
      <>
         <LocationBar>
            <HeaderGroup>
               <HeaderTitle>Roadmap</HeaderTitle>
            </HeaderGroup>
         </LocationBar>
         <ViewBar>
            <div className="flex h-full min-w-0 flex-1 translate-y-[0.5px] items-center justify-end">
               <HeaderActions className="pr-0.5">
                  <RoadmapDisplayOptions />
               </HeaderActions>
            </div>
         </ViewBar>
      </>
   );
}
