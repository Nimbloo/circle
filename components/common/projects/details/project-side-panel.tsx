'use client';

import { DetailSidePanel } from '@/components/common/detail-side-panel';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import { Issue } from '@/data/issues';
import { ProjectDetail } from '@/data/project-details';
import { Project } from '@/data/projects';
import { useRightPanelStore } from '@/store/right-panel-store';
import { ProjectPropertiesPanel } from './project-properties-panel';

interface ProjectSidePanelProps {
   project: Project;
   detail: ProjectDetail;
   issues: Issue[];
   /** Issues shown by the insights panel (e.g. after filters); defaults to `issues`. */
   insightsIssues?: Issue[];
   /** Habilita a edição de milestones (add/complete/remove) no properties panel. */
   projectId?: string;
   /** Re-fetch do detalhe após uma mutação (milestones). Sem ele, o painel é read-only. */
   onChanged?: () => void | Promise<void>;
}

/**
 * Right panel of the project pages. Properties are shown by default; the header
 * switches to the insights panel (right-panel-store: null = properties, 'insights')
 * and the open/closed state is the shared `detail-panel-store` (kind 'project').
 */
export function ProjectSidePanel({
   project,
   detail,
   issues,
   insightsIssues,
   projectId,
   onChanged,
}: ProjectSidePanelProps) {
   const { openPanel } = useRightPanelStore();

   return (
      <DetailSidePanel
         kind="project"
         title="Project details"
         description="View and edit the properties of this project."
      >
         {openPanel === 'insights' ? (
            <InsightsPanel issues={insightsIssues ?? issues} />
         ) : (
            <ProjectPropertiesPanel
               project={project}
               detail={detail}
               issues={issues}
               projectId={projectId}
               onChanged={onChanged}
            />
         )}
      </DetailSidePanel>
   );
}
