'use client';

import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { ListSkeleton } from '@/components/common/list-skeleton';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import ProjectsList from '@/components/common/projects/projects-list';
import { ProjectGroup } from '@/components/common/projects/projects';
import { filterIssuesForView, filterProjectsForView, View } from '@/data/views';
import { ViewFilterChips } from './view-filter-chips';
import { useDisplayOrderedStatuses } from '@/store/catalog-store';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useViewStore } from '@/store/view-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';

function IssueViewBody({ view }: { view: View }) {
   const { openPanel } = useRightPanelStore();
   // Mesmas colunas/ordem e mesmo layout (list/board do "Display") das demais listas.
   const allStatus = useDisplayOrderedStatuses();
   const { viewType } = useViewStore();
   // Filtra contra o store vivo (hidratado da API), não o mock vazio.
   const liveIssues = useIssuesStore((s) => s.issues);
   const loading = useIssuesStore((s) => s.loading);
   const error = useIssuesStore((s) => s.error);
   const hydrate = useIssuesStore((s) => s.hydrate);
   const filtered = useMemo(() => filterIssuesForView(view, liveIssues), [view, liveIssues]);

   // Saved search (#99): quando a view guarda um termo, o RANKING vem do servidor
   // (`/api/v1/search`, o mesmo motor da tela de busca) e a lista é a interseção com o
   // que os demais filtros da view já deixaram passar, na ordem de relevância.
   const q = view.filter.q?.trim() ?? '';
   const [rankedIds, setRankedIds] = useState<string[] | null>(null);
   useEffect(() => {
      if (!q) {
         setRankedIds(null);
         return;
      }
      let active = true;
      api.search
         .query({ q, types: ['issue'], teamId: view.teamId, limit: 100 })
         .then((res) => {
            if (!active) return;
            setRankedIds(res.groups.find((g) => g.type === 'issue')?.items.map((i) => i.id) ?? []);
         })
         .catch(() => active && setRankedIds([]));
      return () => {
         active = false;
      };
   }, [q, view.teamId]);

   const issues = useMemo(() => {
      if (!q) return filtered;
      if (rankedIds === null) return [];
      const position = new Map(rankedIds.map((id, i) => [id, i]));
      return filtered
         .filter((i) => position.has(i.id))
         .sort((a, b) => position.get(a.id)! - position.get(b.id)!);
   }, [q, rankedIds, filtered]);

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
                  loading={loading}
                  error={error}
                  onRetry={() => hydrate()}
               />
            </div>
            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <InsightsPanel issues={issues} />
               </aside>
            )}
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
      // Hidratando → skeleton; not-found só como estado final (fim do flash no deep-link frio).
      if (!loaded) {
         return (
            <div className="p-8">
               <ListSkeleton rows={6} />
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
