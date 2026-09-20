'use client';

import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { usePathname } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { ProjectSidePanel } from './project-side-panel';
import { useSharedProjectDetail } from './use-project-detail';

/**
 * Frame das abas do projeto (pl#6): a coluna da aba + o sidecar, montado UMA vez no
 * layout da rota. Trocar entre Overview, Activity e Issues não remonta o painel — sem
 * fade, sem refazer GETs e sem o pulo de layout.
 */
export function ProjectShell({ projectId, children }: { projectId: string; children: ReactNode }) {
   const project = useWorkspaceStore((s) => s.getProjectById(projectId));
   const allIssues = useIssuesStore((s) => s.issues);
   const { filters } = useFilterStore();
   const pathname = usePathname();
   const { detail, reload } = useSharedProjectDetail(projectId);

   const issues = useMemo(
      () => allIssues.filter((issue) => issue.project?.id === projectId),
      [allIssues, projectId]
   );
   // O Insights acompanha os filtros só na aba Issues (é onde a barra de filtros vive).
   const onIssuesTab = pathname.endsWith('/issues');
   const insightsIssues = useMemo(
      () => (onIssuesTab ? applyIssueFilters(issues, filters) : issues),
      [onIssuesTab, issues, filters]
   );

   return (
      <div className="relative flex h-full w-full overflow-hidden">
         <div className="h-full min-w-0 flex-1">{children}</div>
         {project && (
            <ProjectSidePanel
               project={project}
               detail={detail}
               issues={issues}
               insightsIssues={insightsIssues}
               projectId={projectId}
               onChanged={reload}
            />
         )}
      </div>
   );
}
