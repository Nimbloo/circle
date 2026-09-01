'use client';

import { ProjectsDisplayOptions } from '@/components/common/projects/projects-display-options';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { BarChart3 } from 'lucide-react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { Filter } from './filter';

export const PROJECT_TABS = ['all', 'active'] as const;

const TAB_ITEMS: { label: string; value: (typeof PROJECT_TABS)[number] }[] = [
   { label: 'All projects', value: 'all' },
   { label: 'Active projects', value: 'active' },
];

export function ProjectsViewControls() {
   const [tab, setTab] = useQueryState(
      'tab',
      parseAsStringLiteral(PROJECT_TABS).withDefault('all')
   );
   const openPanel = useRightPanelStore((state) => state.openPanel);
   const togglePanel = useRightPanelStore((state) => state.togglePanel);
   const viewType = useProjectsDisplayStore((state) => state.viewTypes[tab]);

   return (
      <div className="flex h-full min-w-0 flex-1 items-center justify-between">
         <div className="flex items-center gap-1">
            {TAB_ITEMS.map((item) => {
               const isActive = tab === item.value;
               return (
                  <button
                     key={item.value}
                     type="button"
                     onClick={() => void setTab(item.value === 'all' ? null : item.value)}
                     className={cn(
                        'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors',
                        isActive
                           ? 'border-border bg-accent text-foreground'
                           : 'border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                     )}
                  >
                     {item.label}
                  </button>
               );
            })}
         </div>
         <div className="flex items-center gap-1.5 pr-0.5">
            <Filter />
            <ProjectsDisplayOptions />
            <Button
               size="xs"
               variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
               onClick={() => togglePanel('insights')}
               aria-label="Toggle projects insights panel"
               aria-pressed={openPanel === 'insights'}
               data-view-type={viewType}
               className="size-7 p-0"
            >
               <BarChart3 className="size-4" />
            </Button>
         </div>
      </div>
   );
}
