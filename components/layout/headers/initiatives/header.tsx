'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';
import { useInlineInitiativeStore } from '@/store/inline-initiative-store';
import { Plus } from 'lucide-react';

export default function Header() {
   const start = useInlineInitiativeStore((s) => s.start);
   return (
      <LocationBar>
         <HeaderGroup>
            <SidebarTrigger />
            <HeaderTitle>Initiatives</HeaderTitle>
         </HeaderGroup>
         <HeaderActions>
            <Button size="xs" variant="ghost" aria-label="New initiative" onClick={start}>
               <Plus className="size-4" />
            </Button>
         </HeaderActions>
      </LocationBar>
   );
}
