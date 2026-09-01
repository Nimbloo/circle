'use client';

import { Project } from '@/data/projects';
import type { Status } from '@/data/status';
import { useProjectStatuses } from '@/store/catalog-store';
import { useProjectsFilterStore } from '@/store/projects-filter-store';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { PROJECT_TABS } from '@/components/layout/headers/projects/projects-view-controls';
import ProjectsBoard from './projects-board';
import ProjectsInsightsPanel from './projects-insights-panel';
import ProjectsList from './projects-list';
import ProjectsTimeline from './projects-timeline';

export interface ProjectGroup {
   id: string;
   name: string;
   icon?: string;
   status?: Status;
   projects: Project[];
}

/** Categorias de status de PROJETO consideradas "ativas" (Linear: backlog/planned/started). */
const ACTIVE_CATEGORIES = new Set(['backlog', 'planned', 'started']);
/** Categories hidden by "Show closed projects: Hide closed". */
const CLOSED_CATEGORIES = new Set(['completed', 'canceled']);

/**
 * Projects page. With a `teamId` the whole page (tabs, filters, display
 * options, views, insights) is scoped to that team's projects.
 */
export default function Projects({ teamId }: { teamId?: string }) {
   const { filters } = useProjectsFilterStore();
   const { viewTypes, grouping, ordering, closedProjects, showEmptyGroups } =
      useProjectsDisplayStore();
   const openPanel = useRightPanelStore((state) => state.openPanel);
   const allProjects = useWorkspaceStore((s) => s.projects);
   const teams = useWorkspaceStore((s) => s.teams);
   const projectStatuses = useProjectStatuses();
   const [tab] = useQueryState('tab', parseAsStringLiteral(PROJECT_TABS).withDefault('all'));
   const viewType = viewTypes[tab];

   const displayed = useMemo(() => {
      let list = allProjects.slice();

      if (teamId) {
         list = list.filter((project) => project.teamId === teamId);
      }
      if (tab === 'active') {
         list = list.filter((project) => ACTIVE_CATEGORIES.has(project.status.category));
      }
      if (closedProjects === 'hide') {
         list = list.filter((project) => !CLOSED_CATEGORIES.has(project.status.category));
      }
      if (filters.health.length > 0) {
         const healthSet = new Set(filters.health);
         list = list.filter((project) => healthSet.has(project.health.id));
      }
      if (filters.priority.length > 0) {
         const prioritySet = new Set(filters.priority);
         list = list.filter((project) => prioritySet.has(project.priority.id));
      }

      const compare = (a: Project, b: Project) => {
         switch (ordering) {
            case 'title':
               return a.name.localeCompare(b.name);
            case 'target-date':
               return (a.targetDate ?? '').localeCompare(b.targetDate ?? '');
            case 'start-date':
            default:
               return a.startDate.localeCompare(b.startDate);
         }
      };
      return list.sort(compare);
   }, [allProjects, tab, closedProjects, filters, ordering, teamId]);

   const groups = useMemo<ProjectGroup[]>(() => {
      if (viewType === 'board') {
         return projectStatuses
            .map((status) => ({
               id: status.id,
               name: status.name,
               status,
               projects: displayed.filter((project) => project.status.id === status.id),
            }))
            .filter((group) => showEmptyGroups || group.projects.length > 0);
      }
      if (grouping === 'none') {
         return [{ id: 'all', name: 'All projects', projects: displayed }];
      }
      return teams
         .map((team) => ({
            id: team.id,
            name: team.name,
            icon: team.icon,
            projects: displayed.filter((project) => project.teamId === team.id),
         }))
         .filter((group) => showEmptyGroups || group.projects.length > 0);
   }, [teams, displayed, grouping, showEmptyGroups, viewType, projectStatuses]);

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               {viewType === 'timeline' && <ProjectsTimeline groups={groups} />}
               {viewType === 'board' && <ProjectsBoard groups={groups} />}
               {viewType === 'list' && <ProjectsList groups={groups} />}
            </div>

            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[360px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <ProjectsInsightsPanel projects={displayed} />
               </aside>
            )}
         </div>
      </div>
   );
}
