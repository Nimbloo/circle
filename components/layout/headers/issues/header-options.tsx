'use client';

import { Button } from '@/components/ui/button';
import { IssueFilterTrigger } from '@/components/common/issues/issue-filter-trigger';
import { useRightPanelStore } from '@/store/right-panel-store';
import { BarChart3 } from 'lucide-react';
import { DisplayOptions } from '../display-options';

export default function HeaderOptions() {
   const { openPanel, togglePanel } = useRightPanelStore();

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div />
         <div className="flex items-center gap-0.5">
            <IssueFilterTrigger />
            <Button
               size="icon"
               className="h-8 w-8"
               variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
               onClick={() => togglePanel('insights')}
               aria-label="Toggle insights panel"
               title="Insights"
            >
               <BarChart3 className="size-4" />
            </Button>
            <DisplayOptions />
         </div>
      </div>
   );
}
