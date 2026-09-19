'use client';

import { EmptyState } from '@/components/common/empty-state';
import { cn } from '@/lib/utils';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { LoadingArea, useEnterFade } from '@/components/common/loading-area';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { useDisplayOrderedStatuses } from '@/store/catalog-store';
import { useFilterStore } from '@/store/filter-store';
import { selectIssuesLoading, useIssuesStore } from '@/store/issues-store';
import { useViewStore } from '@/store/view-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useMemo } from 'react';
import { DetailSidePanelTrigger } from '@/components/common/detail-side-panel';

interface ProjectIssuesProps {
   projectId: string;
}

/** Project "Issues" tab: the project's issues grouped by status. */
export default function ProjectIssues({ projectId }: ProjectIssuesProps) {
   // Troca de irmão (aba, item, layout) não pisca: só a primeira chegada de conteúdo.
   const fade = useEnterFade('project-tab');
   const project = useWorkspaceStore((s) => s.getProjectById(projectId));
   const loaded = useWorkspaceStore((s) => s.loaded);
   const allIssues = useIssuesStore((s) => s.issues);
   const { filters } = useFilterStore();
   const displayOrderedStatus = useDisplayOrderedStatuses();
   // Layout list/board da view (o "Display" do header) — antes a lista era fixa.
   const { viewType } = useViewStore();
   const loading = useIssuesStore(selectIssuesLoading);
   const error = useIssuesStore((s) => s.error);
   const hydrate = useIssuesStore((s) => s.hydrate);

   const issues = useMemo(
      () => allIssues.filter((issue) => issue.project?.id === projectId),
      [allIssues, projectId]
   );

   // Filters (filter bar + click-to-filter from the insights panel) apply
   // on top of the project scope.
   const displayedIssues = useMemo(() => applyIssueFilters(issues, filters), [issues, filters]);

   if (!project) {
      if (!loaded) return <LoadingArea rows={8} />;
      return (
         <EmptyState
            variant="search"
            title="Project not found"
            description="It may have been deleted or you don't have access to it."
         />
      );
   }

   return (
      <div className={cn(fade && 'content-enter', 'w-full h-full flex flex-col overflow-hidden')}>
         <IssueFilterBar />
         <div className="flex justify-end px-2.5 pt-2 xl:hidden">
            <DetailSidePanelTrigger kind="project" />
         </div>
         <div className="relative flex-1 min-h-0 w-full overflow-hidden">
            <div className="h-full min-w-0 overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={issues}
                  statuses={displayOrderedStatus}
                  isViewTypeGrid={viewType === 'grid'}
                  loading={loading}
                  error={error}
                  onRetry={() => hydrate()}
               />
            </div>
         </div>
      </div>
   );
}
