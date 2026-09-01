'use client';

import {
   INITIATIVE_TABS,
   InitiativesDisplayOptions,
   InitiativesFilter,
} from '@/components/common/initiatives/initiatives';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRightPanelStore } from '@/store/right-panel-store';
import { PanelRight } from 'lucide-react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

const TAB_ITEMS: { label: string; value: (typeof INITIATIVE_TABS)[number] }[] = [
   { label: 'Active', value: 'active' },
   { label: 'Planned', value: 'planned' },
   { label: 'All initiatives', value: 'all' },
];

export function InitiativesViewControls() {
   const [tab, setTab] = useQueryState(
      'tab',
      parseAsStringLiteral(INITIATIVE_TABS).withDefault('active')
   );
   const openPanel = useRightPanelStore((state) => state.openPanel);
   const togglePanel = useRightPanelStore((state) => state.togglePanel);

   return (
      <div className="flex h-full min-w-0 flex-1 translate-y-[0.5px] items-center justify-between">
         <div className="flex items-center gap-1.5">
            {TAB_ITEMS.map((item) => (
               <button
                  key={item.value}
                  type="button"
                  onClick={() => void setTab(item.value === 'active' ? null : item.value)}
                  className={cn(
                     'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors',
                     tab === item.value
                        ? 'border-border bg-accent text-foreground'
                        : 'border-transparent bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
               >
                  {item.label}
               </button>
            ))}
         </div>
         <div className="flex items-center gap-1.5 pr-0.5">
            <InitiativesFilter />
            <InitiativesDisplayOptions />
            <Button
               size="xs"
               variant={openPanel === 'initiatives-breakdown' ? 'secondary' : 'ghost'}
               onClick={() => togglePanel('initiatives-breakdown')}
               aria-label="Toggle initiatives breakdown panel"
               aria-pressed={openPanel === 'initiatives-breakdown'}
               className="size-7 p-0"
            >
               <PanelRight className="size-4" />
            </Button>
         </div>
      </div>
   );
}
