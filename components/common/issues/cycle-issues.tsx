'use client';

import { CycleDetailsPanel } from '@/components/common/cycles/cycle-details-panel';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useDisplayOrderedStatuses } from '@/store/catalog-store';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { applyIssueFilters } from './issue-filter-columns';
import { IssueFilterBar } from './issue-filter-bar';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { GroupedIssuesView } from './grouped-issues-view';
import { InsightsPanel } from './insights-panel';
import { SearchIssues } from './search-issues';

export type CycleView = 'active' | 'upcoming';

interface CycleIssuesProps {
   /** 'active' = current cycle, 'upcoming' = next cycle. */
   cycleView: CycleView;
}

/**
 * Issue view scoped to a cycle — same behavior as AllIssues (search,
 * filters, list/board) plus the cycle details / insights side panels.
 */
export default function CycleIssues({ cycleView }: CycleIssuesProps) {
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { viewType } = useViewStore();
   const { filters } = useFilterStore();
   const issues = useIssuesStore((s) => s.issues);
   const { openPanel } = useRightPanelStore();
   const getCurrentCycle = useWorkspaceStore((s) => s.getCurrentCycle);
   const getUpcomingCycle = useWorkspaceStore((s) => s.getUpcomingCycle);
   const displayOrderedStatus = useDisplayOrderedStatuses();

   // Escopa pelo time da rota — senão pega o ciclo current/upcoming de QUALQUER time
   // (em workspace multi-time, /team/B/cycle/active mostrava o ciclo do time A).
   const { teamId } = useParams<{ teamId: string }>();
   const cycle = cycleView === 'active' ? getCurrentCycle(teamId) : getUpcomingCycle(teamId);

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

   const cycleIssues = useMemo(
      () => (cycle ? issues.filter((issue) => issue.cycleId === cycle.id) : []),
      [issues, cycle]
   );

   const displayedIssues = useMemo(
      () => applyIssueFilters(cycleIssues, filters),
      [cycleIssues, filters]
   );

   if (isSearching) {
      return (
         <div className="w-full h-full">
            <div className="px-6 mb-6">
               <SearchIssues />
            </div>
         </div>
      );
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         {/* Breadcrumb + contagem (estilo Linear: "Cycles › Cycle X" + "N issues") */}
         {cycle && (
            <div className="flex items-center gap-2 px-6 h-9 border-b border-border/60 text-[13px] shrink-0">
               <span className="text-muted-foreground">Cycles</span>
               <span className="text-muted-foreground">›</span>
               <span className="font-medium">{cycle.name}</span>
               <span className="ml-2 text-muted-foreground">
                  {cycleIssues.length} {cycleIssues.length === 1 ? 'issue' : 'issues'}
               </span>
            </div>
         )}
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={cycleIssues}
                  statuses={displayOrderedStatus}
                  isViewTypeGrid={isViewTypeGrid}
               />
            </div>

            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container animate-in slide-in-from-right-4 fade-in duration-200 ease-out">
                  <InsightsPanel issues={displayedIssues} />
               </aside>
            )}
            {openPanel === 'cycle-details' && cycle && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container animate-in slide-in-from-right-4 fade-in duration-200 ease-out">
                  <CycleDetailsPanel cycle={cycle} issues={cycleIssues} />
               </aside>
            )}
         </div>
      </div>
   );
}
