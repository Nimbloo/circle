'use client';

import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import { IssueLine } from '@/components/common/issues/issue-line';
import { BreakdownPanel } from './breakdown-panel';
import { api } from '@/lib/client';
import { useDisplayOrderedStatuses } from '@/store/catalog-store';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useEffect, useMemo, useState } from 'react';
import { scopeMyIssues, useMyIssuesTab } from './use-my-issues';

/**
 * "My issues" body — the exact same machinery as the team issue views
 * (search, filter bar, list/board display, insights panel), scoped to the
 * current tab (Assigned / Created / Subscribed / Activity).
 */
export default function MyIssues() {
   const [tab] = useMyIssuesTab();
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { viewType } = useViewStore();
   const { filters } = useFilterStore();
   const issues = useIssuesStore((s) => s.issues);
   const loading = useIssuesStore((s) => s.loading);
   const error = useIssuesStore((s) => s.error);
   const hydrate = useIssuesStore((s) => s.hydrate);
   const { openPanel } = useRightPanelStore();
   const meId = useWorkspaceStore((s) => s.me?.id);
   const subscribedIssueIds = useWorkspaceStore((s) => s.me?.subscribedIssueIds);
   const displayOrderedStatus = useDisplayOrderedStatuses();

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

   const subscribedIds = useMemo(() => new Set(subscribedIssueIds ?? []), [subscribedIssueIds]);

   // Aba "Activity" (padrão Linear = board de issues em que estive ativo): busca os
   // ids das issues com atividade minha e usa como escopo do board.
   const [activeIds, setActiveIds] = useState<ReadonlySet<string>>(new Set());
   useEffect(() => {
      if (tab !== 'activity') return;
      let alive = true;
      api.me
         .activity()
         .then((items) => alive && setActiveIds(new Set(items.map((i) => i.issueId))))
         .catch(() => {});
      return () => {
         alive = false;
      };
   }, [tab]);

   const scopedIssues = useMemo(
      () => scopeMyIssues(issues, tab, meId, subscribedIds, activeIds),
      [issues, tab, meId, subscribedIds, activeIds]
   );

   const displayedIssues = useMemo(
      () => applyIssueFilters(scopedIssues, filters),
      [scopedIssues, filters]
   );

   // Busca escopada ao tab + filtros ativos (não a global) — coerente com o
   // contrato "My issues" desta tela. Casa título/identifier, como searchIssues.
   const searchedIssues = useMemo(() => {
      if (!isSearching) return [];
      const q = searchQuery.trim().toLowerCase();
      return displayedIssues.filter(
         (i) => i.title.toLowerCase().includes(q) || i.identifier.toLowerCase().includes(q)
      );
   }, [isSearching, searchQuery, displayedIssues]);

   if (isSearching) {
      return (
         <div className="w-full h-full">
            <div className="px-6 mb-6">
               {searchedIssues.length > 0 ? (
                  <div className="border rounded-md mt-4">
                     <div className="py-2 px-4 border-b bg-muted/50">
                        <h3 className="text-sm font-medium">Results ({searchedIssues.length})</h3>
                     </div>
                     <div className="divide-y">
                        {searchedIssues.map((issue) => (
                           <IssueLine key={issue.id} issue={issue} layoutId={false} />
                        ))}
                     </div>
                  </div>
               ) : (
                  <div className="text-center py-8 text-muted-foreground">
                     No results found for &quot;{searchQuery}&quot;
                  </div>
               )}
            </div>
         </div>
      );
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={scopedIssues}
                  statuses={displayOrderedStatus}
                  isViewTypeGrid={isViewTypeGrid}
                  loading={loading}
                  error={error}
                  onRetry={() => hydrate()}
               />
            </div>

            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <InsightsPanel issues={displayedIssues} />
               </aside>
            )}
            {openPanel === 'breakdown' && (
               <aside className="hidden lg:flex w-80 shrink-0 border-l h-full overflow-hidden bg-container">
                  <BreakdownPanel issues={displayedIssues} />
               </aside>
            )}
         </div>
      </div>
   );
}
