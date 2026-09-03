import type { FiltersState } from '@/components/data-table-filter/core/types';
import { applyIssueFilters, NO_PROJECT } from '@/components/common/issues/issue-filter-columns';
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

/** Filtro `option` só quando há valores (array vazio = sem filtro, como no servidor). */
function optionFilter(columnId: string, values: string[] | undefined): FiltersState {
   if (!values?.length) return [];
   return [
      {
         columnId,
         type: 'option',
         operator: values.length > 1 ? 'is any of' : 'is',
         values: [...values],
      },
   ];
}

/**
 * Converte o filtro declarativo de uma view salva para o `FiltersState` do bazza/ui
 * (o mesmo formato da barra de filtro das listas). É o único ponto onde os dois
 * modelos se encontram: `filterIssuesForView` filtra com `applyIssueFilters` e a
 * página da view renderiza os chips a partir do resultado. Semântica = `resolveView`
 * do servidor (arrays vazios são ignorados; `hasProject` = "Project is not No project";
 * `unassigned` = "Assignee is Unassigned").
 */
export function viewFilterToFilters(filter: ViewFilter): FiltersState {
   const filters: FiltersState = [
      ...optionFilter('status', filter.statusIds),
      ...optionFilter('statusType', filter.statusCategories),
   ];
   if (filter.unassigned) {
      filters.push({
         columnId: 'assignee',
         type: 'option',
         operator: 'is',
         values: ['unassigned'],
      });
   }
   filters.push(...optionFilter('priority', filter.priorityIds));
   if (filter.labelIds?.length) {
      filters.push({
         columnId: 'labels',
         type: 'multiOption',
         operator: filter.labelIds.length > 1 ? 'include any of' : 'include',
         values: [...filter.labelIds],
      });
   }
   if (filter.hasProject) {
      filters.push({
         columnId: 'project',
         type: 'option',
         operator: 'is not',
         values: [NO_PROJECT],
      });
   }
   return filters;
}

/**
 * Versão para PROJECT views: só o que `filterProjectsForView` honra (status, tipo de
 * status, prioridade, labels) — alimenta os chips somente leitura com as colunas de
 * `project-filter-columns`. `hasProject`/`unassigned` não se aplicam a projeto.
 */
export function projectViewFilterToFilters(filter: ViewFilter): FiltersState {
   const filters: FiltersState = [
      ...optionFilter('status', filter.statusIds),
      ...optionFilter('statusType', filter.statusCategories),
      ...optionFilter('priority', filter.priorityIds),
   ];
   if (filter.labelIds?.length) {
      filters.push({
         columnId: 'labels',
         type: 'multiOption',
         operator: filter.labelIds.length > 1 ? 'include any of' : 'include',
         values: [...filter.labelIds],
      });
   }
   return filters;
}

/** Apply an issue view's declarative filter to the issue list (same engine as the filter bar). */
export function filterIssuesForView(view: View, source: Issue[] = issues): Issue[] {
   return applyIssueFilters(source, viewFilterToFilters(view.filter));
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
