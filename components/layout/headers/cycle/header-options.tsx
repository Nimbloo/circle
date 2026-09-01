'use client';

import { Button } from '@/components/ui/button';
import { IssueFilterTrigger } from '@/components/common/issues/issue-filter-trigger';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { BarChart3, PanelRight } from 'lucide-react';
import { useParams } from 'next/navigation';
import { DisplayOptions } from '../display-options';
import { CycleView } from '@/components/common/issues/cycle-issues';
import { HeaderActions, ViewBar } from '@/components/layout/header-primitives';

export default function HeaderOptions({ cycleView }: { cycleView: CycleView }) {
   const { openPanel, togglePanel } = useRightPanelStore();
   const issues = useIssuesStore((s) => s.issues);
   const { teamId } = useParams<{ teamId?: string }>();
   const cycle = useWorkspaceStore((s) =>
      cycleView === 'active' ? s.getCurrentCycle(teamId) : s.getUpcomingCycle(teamId)
   );

   const count = issues.filter((issue) => issue.cycleId === cycle?.id).length;

   return (
      <ViewBar>
         <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
               {count} {count === 1 ? 'issue' : 'issues'}
            </span>
         </div>

         <HeaderActions>
            <IssueFilterTrigger />
            <Button
               size="xs"
               variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
               onClick={() => togglePanel('insights')}
               aria-label="Toggle insights panel"
            >
               <BarChart3 className="size-4" />
            </Button>
            <Button
               size="xs"
               variant={openPanel === 'cycle-details' ? 'secondary' : 'ghost'}
               onClick={() => togglePanel('cycle-details')}
               aria-label="Toggle cycle details panel"
            >
               <PanelRight className="size-4" />
            </Button>
            <DisplayOptions />
         </HeaderActions>
      </ViewBar>
   );
}
