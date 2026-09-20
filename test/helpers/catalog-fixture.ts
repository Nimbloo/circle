/**
 * Catálogo de TESTE (status e labels no formato do bootstrap). O app não tem mais
 * catálogo mock (#16): os dados vivos vêm da API; os testes usam estes valores, que
 * espelham o seed de `db/seed-catalogs.ts`.
 */
import { statusIconFor, type Status, type StatusCategory } from '@/data/status';
import type { LabelInterface } from '@/data/labels';
import { priorities } from '@/data/priorities';
import { health } from '@/data/projects';
import { useCatalogStore } from '@/store/catalog-store';

const rows: [string, string, string, StatusCategory][] = [
   ['in-progress', 'In Progress', '#facc15', 'started'],
   ['technical-review', 'Technical Review', '#22c55e', 'started'],
   ['done', 'Done', '#5e6ad2', 'completed'],
   ['paused', 'Paused', '#26b5ce', 'started'],
   ['to-do', 'Todo', '#99a2b2', 'unstarted'],
   ['backlog', 'Backlog', '#95a2b3', 'backlog'],
   ['triage', 'Triage', '#f2790f', 'triage'],
   ['idea', 'Idea', '#5e6ad2', 'backlog'],
   ['product-feedback', 'Product Feedback', '#f2994a', 'started'],
   ['blocked', 'Blocked', '#eb5757', 'started'],
   ['shipped', 'Shipped', '#4cb782', 'completed'],
   ['canceled', 'Canceled', '#95a2b3', 'canceled'],
   ['duplicate', 'Duplicate', '#95a2b3', 'canceled'],
];

export const status: Status[] = rows.map(([id, name, color, category]) => ({
   id,
   name,
   color,
   category,
   icon: statusIconFor(category, color, undefined, name),
}));

export const labels: LabelInterface[] = [
   { id: 'ui', name: 'UI Enhancement', color: 'purple' },
   { id: 'bug', name: 'Bug', color: 'red' },
   { id: 'feature', name: 'Feature', color: 'green' },
   { id: 'documentation', name: 'Documentation', color: 'blue' },
   { id: 'refactor', name: 'Refactor', color: 'yellow' },
   { id: 'performance', name: 'Performance', color: 'orange' },
   { id: 'design', name: 'Design', color: 'pink' },
   { id: 'security', name: 'Security', color: 'gray' },
   { id: 'accessibility', name: 'Accessibility', color: 'indigo' },
   { id: 'testing', name: 'Testing', color: 'teal' },
   { id: 'internationalization', name: 'Internationalization', color: 'cyan' },
];

/**
 * Semeia o catálogo vivo com os valores de teste — o que o bootstrap faria. Telas que
 * leem o catálogo (seletores, chips) precisam dele carregado.
 */
export function seedCatalog(): void {
   useCatalogStore.setState({
      loaded: true,
      statuses: status,
      projectStatuses: status,
      priorities,
      labels,
      healthStates: health,
   });
}
