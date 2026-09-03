'use client';

import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { ListSkeleton } from '@/components/common/list-skeleton';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { adaptProjectDetail, emptyProjectDetail } from '@/lib/adapters-project-detail';
import { api } from '@/lib/client';
import type { ProjectDetail } from '@/data/project-details';
import { useDisplayOrderedStatuses } from '@/store/catalog-store';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { useViewStore } from '@/store/view-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useEffect, useMemo, useState } from 'react';
import { DetailSidePanelTrigger } from '@/components/common/detail-side-panel';
import { ProjectSidePanel } from './project-side-panel';

interface ProjectIssuesProps {
   projectId: string;
}

/** Project "Issues" tab: the project's issues grouped by status. */
export default function ProjectIssues({ projectId }: ProjectIssuesProps) {
   const project = useWorkspaceStore((s) => s.getProjectById(projectId));
   const loaded = useWorkspaceStore((s) => s.loaded);
   const allIssues = useIssuesStore((s) => s.issues);
   const { filters } = useFilterStore();
   const displayOrderedStatus = useDisplayOrderedStatuses();
   // Layout list/board da view (o "Display" do header) — antes a lista era fixa.
   const { viewType } = useViewStore();
   const loading = useIssuesStore((s) => s.loading);
   const error = useIssuesStore((s) => s.error);
   const hydrate = useIssuesStore((s) => s.hydrate);

   const [detail, setDetail] = useState<ProjectDetail>(() => emptyProjectDetail(projectId));
   // Refetch do detalhe após mutação no painel (milestones) — sem ele o painel é read-only.
   const [reloadKey, setReloadKey] = useState(0);
   useEffect(() => {
      let active = true;
      api.projects
         .detail(projectId)
         .then((dto) => {
            if (active) setDetail(adaptProjectDetail(dto));
         })
         .catch(() => {
            if (active) setDetail(emptyProjectDetail(projectId));
         });
      return () => {
         active = false;
      };
   }, [projectId, reloadKey]);

   const issues = useMemo(
      () => allIssues.filter((issue) => issue.project?.id === projectId),
      [allIssues, projectId]
   );

   // Filters (filter bar + click-to-filter from the insights panel) apply
   // on top of the project scope.
   const displayedIssues = useMemo(() => applyIssueFilters(issues, filters), [issues, filters]);

   if (!project) {
      if (!loaded) return <ListSkeleton rows={8} />;
      return (
         <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Project not found.
         </div>
      );
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <IssueFilterBar />
         <div className="flex justify-end px-2.5 pt-2 xl:hidden">
            <DetailSidePanelTrigger kind="project" />
         </div>
         <div className="relative flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
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
            <ProjectSidePanel
               project={project}
               detail={detail}
               issues={issues}
               insightsIssues={displayedIssues}
               projectId={projectId}
               onChanged={() => setReloadKey((k) => k + 1)}
            />
         </div>
      </div>
   );
}
