'use client';

import { Button } from '@/components/ui/button';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
   ViewBar,
} from '@/components/layout/header-primitives';
import { useInlineInitiativeStore } from '@/store/inline-initiative-store';
import { Plus } from 'lucide-react';
import { InitiativesViewControls } from './initiatives-view-controls';

export default function Header() {
   const start = useInlineInitiativeStore((s) => s.start);
   return (
      <>
         <LocationBar>
            <HeaderGroup>
               <HeaderTitle>Initiatives</HeaderTitle>
            </HeaderGroup>
            <HeaderActions className="pr-0.5">
               <Button size="xs" variant="ghost" className="h-7 px-2.5 text-xs" onClick={start}>
                  <Plus className="size-4" />
                  New initiative
               </Button>
            </HeaderActions>
         </LocationBar>
         <ViewBar>
            <InitiativesViewControls />
         </ViewBar>
      </>
   );
}
