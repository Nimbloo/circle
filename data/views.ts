import { Issue, issues } from './issues';
import { Project, projects } from './projects';
import { StatusCategory } from './status';
import { User } from './users';

export type ViewType = 'issue' | 'project';

/** Declarative filter of a saved view, applied by getViewIssues/getViewProjects. */
export interface ViewFilter {
   statusCategories?: StatusCategory[];
   statusIds?: string[];
   labelIds?: string[];
   priorityIds?: string[];
   /** Only issues that belong to a project. */
   hasProject?: boolean;
   /** Only issues assigned to nobody. */
   unassigned?: boolean;
}

export interface View {
   id: string;
   name: string;
   description: string;
   /** Emoji shown as the view icon. */
   icon: string;
   type: ViewType;
   /** Owning team; undefined = workspace-level view. */
   teamId?: string;
   owner: User;
   createdAt: string;
   updatedAt: string;
   filter: ViewFilter;
}

/** Saved views of the workspace (Views page). Fake data, LNDev UI storyline. */
export const views: View[] = [];

export const issueViews = views.filter((view) => view.type === 'issue');
export const projectViews = views.filter((view) => view.type === 'project');

export function getViewsByTeam(teamId: string): View[] {
   return views.filter((view) => view.teamId === teamId);
}

export function getViewById(id: string): View | undefined {
   return views.find((view) => view.id === id);
}

/** Apply an issue view's declarative filter to the issue list. */
export function filterIssuesForView(view: View, source: Issue[] = issues): Issue[] {
   const { filter } = view;
   return source.filter((issue) => {
      if (filter.statusCategories && !filter.statusCategories.includes(issue.status.category)) {
         return false;
      }
      if (filter.statusIds && !filter.statusIds.includes(issue.status.id)) return false;
      if (filter.labelIds && !issue.labels.some((label) => filter.labelIds?.includes(label.id))) {
         return false;
      }
      if (filter.priorityIds && !filter.priorityIds.includes(issue.priority.id)) return false;
      if (filter.hasProject && !issue.project) return false;
      if (filter.unassigned && issue.assignee) return false;
      return true;
   });
}

/** Apply a project view's declarative filter to the project list. */
export function filterProjectsForView(view: View, source: Project[] = projects): Project[] {
   const { filter } = view;
   return source.filter((project) => {
      if (filter.statusCategories && !filter.statusCategories.includes(project.status.category)) {
         return false;
      }
      // statusIds era ignorado — o editor de project view seta statusIds, então
      // filtrar project view por status virava no-op (mostrava tudo).
      if (filter.statusIds && !filter.statusIds.includes(project.status.id)) return false;
      if (filter.priorityIds && !filter.priorityIds.includes(project.priority.id)) return false;
      // labelIds: alinhado ao resolveView do servidor (antes o client ignorava, então
      // uma project view com labelIds renderizava diferente do backend).
      if (filter.labelIds && !project.labels.some((label) => filter.labelIds?.includes(label.id))) {
         return false;
      }
      return true;
   });
}
