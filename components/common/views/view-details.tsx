'use client';

import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { LoadingArea } from '@/components/common/loading-area';
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
import ProjectsList from '@/components/common/projects/projects-list';
import { ProjectGroup } from '@/components/common/projects/projects';
import { filterProjectsForView, View } from '@/data/views';
import { SAVED_SEARCH_LIMIT, savedSearchKey, useViewIssues } from './use-view-issues';
import { useSavedSearchStore } from '@/store/saved-search-store';
import { ViewFilterChips } from './view-filter-chips';
import { useDisplayOrderedStatuses } from '@/store/catalog-store';
import { selectIssuesLoading, useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useViewStore } from '@/store/view-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { SidePanelSlot } from '@/components/common/detail-side-panel';

function IssueViewBody({ view }: { view: View }) {
   const { openPanel } = useRightPanelStore();
   // Mesmas colunas/ordem e mesmo layout (list/board do "Display") das demais listas.
   const allStatus = useDisplayOrderedStatuses();
   const { viewType } = useViewStore();
   const loading = useIssuesStore(selectIssuesLoading);
   const error = useIssuesStore((s) => s.error);
   const hydrate = useIssuesStore((s) => s.hydrate);
   // Saved search (#99): quando a view guarda um termo, o RANKING vem do servidor
   // (`/api/v1/search`, o mesmo motor da tela de busca) e a lista é a interseção com o
   // que os demais filtros da view já deixaram passar, na ordem de relevância. O
   // resultado vive no `saved-search-store`: o header conta a MESMA lista.
   const { q, issues, searching, searchError } = useViewIssues(view);
   const searchKey = savedSearchKey(view);
   const setEntry = useSavedSearchStore((s) => s.setEntry);
   const [attempt, setAttempt] = useState(0);
   // Is#19/Ad#15: com termo, a 1ª busca mostra carregando (não o vazio) e falha vira erro
   // com retry. Mudança nas issues (eventos) refaz a busca com debounce, mantendo o
   // resultado anterior na tela (sem voltar ao carregando).
   // Assinatura (não o array): muda só quando alguma issue muda de fato, não a cada
   // re-hidratação ou update otimista que recria o array com o mesmo conteúdo.
   const issuesSignature = useIssuesStore((s) =>
      s.issues.map((i) => `${i.id}:${i.updatedAt ?? ''}`).join('|')
   );
   useEffect(() => {
      if (!q) return;
      let active = true;
      const hasResult = () =>
         (useSavedSearchStore.getState().byKey[searchKey]?.rankedIds ?? null) !== null;
      const timer = setTimeout(
         () => {
            api.search
               .query({ q, types: ['issue'], teamId: view.teamId, limit: SAVED_SEARCH_LIMIT })
               .then((res) => {
                  if (!active) return;
                  setEntry(searchKey, {
                     rankedIds:
                        res.groups.find((g) => g.type === 'issue')?.items.map((i) => i.id) ?? [],
                     error: false,
                  });
               })
               .catch(() => {
                  // Refetch em segundo plano que falha mantém o resultado que já está na tela.
                  if (active && !hasResult()) setEntry(searchKey, { rankedIds: null, error: true });
               });
         },
         hasResult() ? 400 : 0
      );
      return () => {
         active = false;
         clearTimeout(timer);
      };
      // `issuesSignature`: evento remoto/local mudou as issues → o ranking pode ter mudado.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [q, searchKey, attempt, issuesSignature]);

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <ViewFilterChips view={view} />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={issues}
                  totalIssues={issues}
                  statuses={allStatus}
                  isViewTypeGrid={viewType === 'grid'}
                  loading={loading || searching}
                  error={error || searchError}
                  onRetry={() => {
                     if (error) void hydrate();
                     if (searchError) {
                        setEntry(searchKey, { rankedIds: null, error: false });
                        setAttempt((n) => n + 1);
                     }
                  }}
               />
            </div>
            <SidePanelSlot
               open={openPanel === 'insights'}
               width={420}
               label="Insights"
               className="hidden lg:flex"
               panelClassName="border-l bg-container"
            >
               <InsightsPanel issues={issues} />
            </SidePanelSlot>
         </div>
      </div>
   );
}

function ProjectViewBody({ view }: { view: View }) {
   // Filtra contra o store vivo (hidratado da API), não o mock stale.
   const liveProjects = useWorkspaceStore((s) => s.projects);
   const groups = useMemo<ProjectGroup[]>(() => {
      const projects = filterProjectsForView(view, liveProjects);
      const byStatus = new Map<string, ProjectGroup>();
      for (const project of projects) {
         const key = project.status.id;
         if (!byStatus.has(key)) {
            byStatus.set(key, { id: key, name: project.status.name, projects: [] });
         }
         byStatus.get(key)!.projects.push(project);
      }
      return [...byStatus.values()];
   }, [view, liveProjects]);

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <ViewFilterChips view={view} />
         <div className="flex-1 min-h-0 w-full overflow-hidden">
            <ProjectsList groups={groups} />
         </div>
      </div>
   );
}

/** Saved-view detail page: filtered issues (with insights) or projects. */
export default function ViewDetails({ viewId }: { viewId: string }) {
   const view = useWorkspaceStore((s) => s.getViewById(viewId));
   const loaded = useWorkspaceStore((s) => s.loaded);

   if (!view) {
      // Hidratando → loading; not-found só como estado final (fim do flash no deep-link frio).
      if (!loaded) {
         return (
            <div className="p-8">
               <LoadingArea rows={6} />
            </div>
         );
      }
      return (
         <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            View not found
         </div>
      );
   }

   return view.type === 'issue' ? <IssueViewBody view={view} /> : <ProjectViewBody view={view} />;
}
