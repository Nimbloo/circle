'use client';

import { Issue } from '@/data/issues';
import { StatusCategory } from '@/data/status';
import { useDisplayOrderedStatuses } from '@/store/catalog-store';
import { useFilterStore } from '@/store/filter-store';
import { selectIssuesLoading, useIssuesStore } from '@/store/issues-store';
import { applyIssueFilters } from './issue-filter-columns';
import { IssueFilterBar } from './issue-filter-bar';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { GroupedIssuesView } from './grouped-issues-view';
import dynamic from 'next/dynamic';
import { SearchIssues } from './search-issues';
import { SidePanelSlot } from '@/components/common/detail-side-panel';

// Code-split: o painel de insights (pesado, com gráficos) só renderiza quando aberto
// (openPanel === 'insights'). dynamic() tira o chunk do bundle da página core.
const InsightsPanel = dynamic(
   () => import('./insights-panel').then((m) => ({ default: m.InsightsPanel })),
   { ssr: false }
);

interface AllIssuesProps {
   /**
    * Optional status-category filter, used by the "Active" and "Backlog"
    * tabs. When omitted, every status is shown ("All issues").
    */
   categories?: StatusCategory[];
}

export default function AllIssues({ categories }: AllIssuesProps) {
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { viewType } = useViewStore();
   const { filters } = useFilterStore();
   // Selectors granulares: só re-renderiza quando o campo lido muda (não o store inteiro).
   const issues = useIssuesStore((s) => s.issues);
   const loading = useIssuesStore(selectIssuesLoading);
   const error = useIssuesStore((s) => s.error);
   const hydrate = useIssuesStore((s) => s.hydrate);
   const { openPanel } = useRightPanelStore();

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

   const displayOrderedStatus = useDisplayOrderedStatuses();
   const statuses = useMemo(
      () =>
         categories
            ? displayOrderedStatus.filter((s) => categories.includes(s.category))
            : displayOrderedStatus,
      [categories, displayOrderedStatus]
   );

   // Escopo por TIME (rota /team/<teamId>/...): antes o board ignorava o teamId e
   // mostrava as issues de TODOS os times (bug + perf). Agora filtra pelo time da rota.
   const { teamId } = useParams<{ teamId?: string }>();
   const scopedIssues = useMemo<Issue[]>(() => {
      let list = teamId ? issues.filter((issue) => issue.teamId === teamId) : issues;
      if (categories) list = list.filter((issue) => categories.includes(issue.status.category));
      // Snooze de triage (paridade Linear): issue em triage adiada some SÓ da fila de
      // triage até vencer (is#23: aplicava sempre, e a issue sumia também de "All
      // issues", sem jeito de ver/desfazer — o context menu já tem "Remover snooze",
      // mas só ajuda se a issue continuar visível em algum lugar).
      if (categories?.includes('triage')) {
         const now = Date.now();
         list = list.filter(
            (issue) => !issue.snoozedUntil || new Date(issue.snoozedUntil).getTime() <= now
         );
      }
      return list;
   }, [issues, categories, teamId]);

   const displayedIssues = useMemo(
      () => applyIssueFilters(scopedIssues, filters),
      [scopedIssues, filters]
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
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={scopedIssues}
                  statuses={statuses}
                  isViewTypeGrid={isViewTypeGrid}
                  loading={loading}
                  error={error}
                  onRetry={() => hydrate()}
               />
            </div>

            <SidePanelSlot
               open={openPanel === 'insights'}
               width={420}
               label="Insights"
               className="hidden lg:flex"
               panelClassName="border-l bg-container"
            >
               <InsightsPanel issues={displayedIssues} />
            </SidePanelSlot>
         </div>
      </div>
   );
}
