import type { Project } from '@/data/projects';

export interface InitiativeProjectGroup {
   key: string;
   label: string;
   projects: Project[];
}

/**
 * Agrupa os projetos de uma initiative por categoria de status (pl#3). As categorias
 * reais de projeto são `backlog | planned | started | completed | canceled` — agrupar
 * "Planned" por `unstarted` (categoria de issue) escondia os projetos Planned, e não
 * havia grupo para Canceled. Todo projeto vinculado cai em exatamente um grupo.
 */
const GROUPS: { key: string; label: string; categories: string[] }[] = [
   { key: 'in-progress', label: 'In Progress', categories: ['started'] },
   { key: 'planned', label: 'Planned', categories: ['planned', 'unstarted'] },
   { key: 'backlog', label: 'Backlog', categories: ['backlog', 'triage'] },
   { key: 'completed', label: 'Completed', categories: ['completed'] },
   { key: 'canceled', label: 'Canceled', categories: ['canceled'] },
];

export function groupInitiativeProjects(projects: Project[]): InitiativeProjectGroup[] {
   return GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      projects: projects.filter((project) => group.categories.includes(project.status.category)),
   })).filter((group) => group.projects.length > 0);
}
