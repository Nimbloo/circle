import { describe, expect, it } from 'vitest';
import type { Issue } from '@/data/issues';
import { filterIssuesForView, viewFilterToFilters, type View, type ViewFilter } from '@/data/views';
import { NO_PROJECT } from '@/components/common/issues/issue-filter-columns';

/**
 * `viewFilterToFilters` é a ponte entre o filtro declarativo da view salva e o
 * `FiltersState` da barra de filtro. Cada campo do `ViewFilter` precisa virar o
 * `FilterModel` que a barra criaria à mão — e `filterIssuesForView`, que agora delega
 * em `applyIssueFilters`, tem que devolver o MESMO conjunto do motor antigo.
 */

describe('viewFilterToFilters', () => {
   it('filtro vazio vira []', () => {
      expect(viewFilterToFilters({})).toEqual([]);
   });

   it('arrays vazios são ignorados (semântica do servidor)', () => {
      expect(
         viewFilterToFilters({ statusIds: [], priorityIds: [], labelIds: [], statusCategories: [] })
      ).toEqual([]);
   });

   it('statusIds vira option em status ("is" com um valor, "is any of" com vários)', () => {
      expect(viewFilterToFilters({ statusIds: ['in-progress'] })).toEqual([
         { columnId: 'status', type: 'option', operator: 'is', values: ['in-progress'] },
      ]);
      expect(viewFilterToFilters({ statusIds: ['in-progress', 'to-do'] })).toEqual([
         {
            columnId: 'status',
            type: 'option',
            operator: 'is any of',
            values: ['in-progress', 'to-do'],
         },
      ]);
   });

   it('statusCategories vira option em statusType', () => {
      expect(viewFilterToFilters({ statusCategories: ['started', 'completed'] })).toEqual([
         {
            columnId: 'statusType',
            type: 'option',
            operator: 'is any of',
            values: ['started', 'completed'],
         },
      ]);
   });

   it('priorityIds vira option em priority', () => {
      expect(viewFilterToFilters({ priorityIds: ['high'] })).toEqual([
         { columnId: 'priority', type: 'option', operator: 'is', values: ['high'] },
      ]);
   });

   it('labelIds vira multiOption em labels ("include" / "include any of")', () => {
      expect(viewFilterToFilters({ labelIds: ['bug'] })).toEqual([
         { columnId: 'labels', type: 'multiOption', operator: 'include', values: ['bug'] },
      ]);
      expect(viewFilterToFilters({ labelIds: ['bug', 'feature'] })).toEqual([
         {
            columnId: 'labels',
            type: 'multiOption',
            operator: 'include any of',
            values: ['bug', 'feature'],
         },
      ]);
   });

   it('unassigned vira "Assignee is Unassigned"', () => {
      expect(viewFilterToFilters({ unassigned: true })).toEqual([
         { columnId: 'assignee', type: 'option', operator: 'is', values: ['unassigned'] },
      ]);
      expect(viewFilterToFilters({ unassigned: false })).toEqual([]);
   });

   it('hasProject vira "Project is not No project"', () => {
      expect(viewFilterToFilters({ hasProject: true })).toEqual([
         { columnId: 'project', type: 'option', operator: 'is not', values: [NO_PROJECT] },
      ]);
      expect(viewFilterToFilters({ hasProject: false })).toEqual([]);
   });

   it('campos combinados viram um FilterModel por coluna', () => {
      const filters = viewFilterToFilters({
         statusIds: ['in-progress'],
         priorityIds: ['high', 'urgent'],
         labelIds: ['bug'],
         unassigned: true,
         hasProject: true,
      });
      expect(filters.map((f) => f.columnId)).toEqual([
         'status',
         'assignee',
         'priority',
         'labels',
         'project',
      ]);
   });

   it('não compartilha o array de valores com o ViewFilter de origem', () => {
      const statusIds = ['in-progress'];
      const [filter] = viewFilterToFilters({ statusIds });
      expect(filter.values).not.toBe(statusIds);
   });
});

/* ------------------- filterIssuesForView × motor antigo ------------------- */

/** Issue mínima para os accessors usados (status, priority, assignee, labels, project). */
function issue(partial: Partial<Issue> & { id: string }): Issue {
   return {
      identifier: partial.id,
      title: partial.id,
      status: { id: 'to-do', category: 'unstarted' },
      priority: { id: 'no-priority' },
      assignee: null,
      labels: [],
      cycleId: '',
      createdAt: '2026-09-01T00:00:00Z',
      ...partial,
   } as unknown as Issue;
}

const user = { id: 'u1', name: 'Ana' } as Issue['assignee'];
const bug = { id: 'bug', name: 'Bug' } as Issue['labels'][number];
const feature = { id: 'feature', name: 'Feature' } as Issue['labels'][number];
const project = { id: 'p1', name: 'P1' } as Issue['project'];

const fixture: Issue[] = [
   issue({
      id: 'A',
      status: { id: 'in-progress', category: 'started' } as Issue['status'],
      priority: { id: 'high' } as Issue['priority'],
      labels: [bug],
      project,
   }),
   issue({
      id: 'B',
      status: { id: 'to-do', category: 'unstarted' } as Issue['status'],
      priority: { id: 'high' } as Issue['priority'],
      assignee: user,
      labels: [feature],
   }),
   issue({
      id: 'C',
      status: { id: 'in-progress', category: 'started' } as Issue['status'],
      priority: { id: 'low' } as Issue['priority'],
      assignee: user,
      labels: [bug, feature],
      project,
   }),
   issue({
      id: 'D',
      status: { id: 'done', category: 'completed' } as Issue['status'],
      priority: { id: 'urgent' } as Issue['priority'],
   }),
];

/** O motor declarativo que `filterIssuesForView` tinha antes de delegar. */
function legacyFilter(filter: ViewFilter, source: Issue[]): Issue[] {
   return source.filter((i) => {
      if (filter.statusCategories?.length && !filter.statusCategories.includes(i.status.category))
         return false;
      if (filter.statusIds?.length && !filter.statusIds.includes(i.status.id)) return false;
      if (filter.labelIds?.length && !i.labels.some((l) => filter.labelIds?.includes(l.id)))
         return false;
      if (filter.priorityIds?.length && !filter.priorityIds.includes(i.priority.id)) return false;
      if (filter.hasProject && !i.project) return false;
      if (filter.unassigned && i.assignee) return false;
      return true;
   });
}

const asView = (filter: ViewFilter): View => ({ filter }) as View;

describe('filterIssuesForView (delegando em applyIssueFilters)', () => {
   const cases: ViewFilter[] = [
      {},
      { statusIds: ['in-progress'] },
      { statusIds: ['in-progress', 'done'] },
      { statusCategories: ['started'] },
      { statusCategories: ['started', 'completed'] },
      { priorityIds: ['high'] },
      { priorityIds: ['high', 'low'] },
      { labelIds: ['bug'] },
      { labelIds: ['bug', 'feature'] },
      { unassigned: true },
      { hasProject: true },
      { statusIds: ['in-progress'], priorityIds: ['high'] },
      {
         statusIds: ['in-progress'],
         priorityIds: ['high', 'low'],
         unassigned: true,
         labelIds: ['bug'],
      },
      { statusCategories: ['started'], labelIds: ['feature'], hasProject: true },
   ];

   for (const filter of cases) {
      it(`dá o mesmo conjunto do motor antigo: ${JSON.stringify(filter)}`, () => {
         const ids = (list: Issue[]) => list.map((i) => i.id);
         expect(ids(filterIssuesForView(asView(filter), fixture))).toEqual(
            ids(legacyFilter(filter, fixture))
         );
      });
   }

   it('exemplo concreto: statusIds + priorityIds + unassigned + labelIds', () => {
      const out = filterIssuesForView(
         asView({
            statusIds: ['in-progress'],
            priorityIds: ['high', 'low'],
            unassigned: true,
            labelIds: ['bug'],
         }),
         fixture
      );
      expect(out.map((i) => i.id)).toEqual(['A']);
   });
});
