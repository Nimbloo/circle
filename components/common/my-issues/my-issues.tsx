'use client';

import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import dynamic from 'next/dynamic';

// O painel de insights carrega recharts (357 KB no bundle) e só renderiza quando
// aberto — sob demanda, como no `all-issues`.
const InsightsPanel = dynamic(
   () =>
      import('@/components/common/issues/insights-panel').then((m) => ({
         default: m.InsightsPanel,
      })),
   { ssr: false }
);
import { IssueLine } from '@/components/common/issues/issue-line';
import { EmptyState } from '@/components/common/empty-state';
import { BreakdownPanel } from './breakdown-panel';
import { api } from '@/lib/client';
import { useDisplayOrderedStatuses } from '@/store/catalog-store';
import { useFilterStore } from '@/store/filter-store';
import { selectIssuesLoading, useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useEffect, useMemo, useState } from 'react';
import { scopeMyIssues, useMyIssuesActiveIds, useMyIssuesTab } from './use-my-issues';
import { SidePanelSlot } from '@/components/common/detail-side-panel';
import { toast } from 'sonner';

const SUBSCRIPTIONS_ERROR_TOAST = 'my-issues-subscriptions-error';

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
   const loading = useIssuesStore(selectIssuesLoading);
   const error = useIssuesStore((s) => s.error);
   const hydrate = useIssuesStore((s) => s.hydrate);
   const { openPanel } = useRightPanelStore();
   const meId = useWorkspaceStore((s) => s.me?.id);
   const subscribedIssueIds = useWorkspaceStore((s) => s.me?.subscribedIssueIds);
   const displayOrderedStatus = useDisplayOrderedStatuses();

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

   // Aba "Subscribed": o bootstrap só traz as assinaturas de issues abertas; a lista
   // completa (com as fechadas) vem sob demanda e é unida às vivas do store.
   const [allSubscribed, setAllSubscribed] = useState<readonly string[]>([]);
   const [subscriptionsAttempt, setSubscriptionsAttempt] = useState(0);
   useEffect(() => {
      if (tab !== 'subscribed') return;
      let alive = true;
      api.me
         .subscriptions()
         .then(({ issueIds }) => {
            if (!alive) return;
            setAllSubscribed(issueIds);
            toast.dismiss(SUBSCRIPTIONS_ERROR_TOAST);
         })
         // Falha calada mostrava só as abertas como se fosse tudo: avisa, com retry.
         .catch(() => {
            if (!alive) return;
            toast.error('Não foi possível carregar as assinaturas de issues fechadas', {
               id: SUBSCRIPTIONS_ERROR_TOAST,
               action: {
                  label: 'Tentar novamente',
                  onClick: () => setSubscriptionsAttempt((n) => n + 1),
               },
            });
         });
      return () => {
         alive = false;
      };
   }, [tab, subscribedIssueIds, subscriptionsAttempt]);
   // O Retry do toast só busca nesta aba: sair dela (ou da tela) dispensa o aviso.
   useEffect(() => {
      if (tab !== 'subscribed') return;
      return () => {
         toast.dismiss(SUBSCRIPTIONS_ERROR_TOAST);
      };
   }, [tab]);
   const subscribedIds = useMemo(() => {
      const live = new Set(subscribedIssueIds ?? []);
      return new Set([...(tab === 'subscribed' ? allSubscribed : []), ...live]);
   }, [subscribedIssueIds, allSubscribed, tab]);

   // Aba "Activity" (padrão Linear = board de issues em que estive ativo): ids das
   // issues com atividade minha, usados como escopo do board.
   const activeIds = useMyIssuesActiveIds(tab);

   // Aba "Assigned" (#29): derivada do store — os DTOs já trazem todos os responsáveis
   // (principal + colaboradores). Sem busca `assignee=me` a cada mudança de responsável.
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
                           <IssueLine key={issue.id} issue={issue} />
                        ))}
                     </div>
                  </div>
               ) : (
                  <EmptyState
                     variant="search"
                     title="No results"
                     description={`Nothing matches "${searchQuery}".`}
                  />
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

            <SidePanelSlot
               open={openPanel === 'insights'}
               width={420}
               label="Insights"
               className="hidden lg:flex"
               panelClassName="border-l bg-container"
            >
               <InsightsPanel issues={displayedIssues} />
            </SidePanelSlot>
            <SidePanelSlot
               open={openPanel === 'breakdown'}
               width={320}
               label="Breakdown"
               className="hidden lg:flex"
               panelClassName="border-l bg-container"
            >
               <BreakdownPanel issues={displayedIssues} />
            </SidePanelSlot>
         </div>
      </div>
   );
}
