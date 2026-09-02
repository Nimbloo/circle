import { describe, expect, it } from 'vitest';
import type { Issue } from '@/data/issues';
import { applyIssueFilters, NO_PROJECT } from '@/components/common/issues/issue-filter-columns';

/** Issue mínima para os accessors usados aqui (project, creator, dueDate). */
function issue(partial: Partial<Issue> & { id: string }): Issue {
   return {
      identifier: partial.id,
      title: partial.id,
      status: { id: 'todo', category: 'unstarted' },
      priority: { id: 'none' },
      assignee: null,
      labels: [],
      cycleId: '',
      createdAt: '2026-09-01T00:00:00Z',
      ...partial,
   } as unknown as Issue;
}

const withProject = issue({ id: 'A', project: { id: 'p1' } as Issue['project'] });
const noProject = issue({ id: 'B' });
const dated = issue({ id: 'C', dueDate: '2026-09-10' });
const undated = issue({ id: 'D' });

describe('applyIssueFilters — valor ausente', () => {
   it('"Project is not X" mantém as issues sem projeto', () => {
      const out = applyIssueFilters(
         [withProject, noProject],
         [{ columnId: 'project', type: 'option', operator: 'is not', values: ['p1'] }]
      );
      expect(out.map((i) => i.id)).toEqual(['B']);
   });

   it('"Project is No project" é uma opção explícita', () => {
      const out = applyIssueFilters(
         [withProject, noProject],
         [{ columnId: 'project', type: 'option', operator: 'is', values: [NO_PROJECT] }]
      );
      expect(out.map((i) => i.id)).toEqual(['B']);
   });

   it('"Due date is not <dia>" mantém as issues sem data; "is before" não', () => {
      const isNot = applyIssueFilters(
         [dated, undated],
         [
            {
               columnId: 'dueDate',
               type: 'date',
               operator: 'is not',
               values: [new Date('2026-09-10')],
            },
         ]
      );
      expect(isNot.map((i) => i.id)).toEqual(['D']);
      const before = applyIssueFilters(
         [dated, undated],
         [
            {
               columnId: 'dueDate',
               type: 'date',
               operator: 'is before',
               values: [new Date('2026-09-11')],
            },
         ]
      );
      expect(before.map((i) => i.id)).toEqual(['C']);
   });

   it('"Labels exclude X" mantém issues sem labels', () => {
      const out = applyIssueFilters(
         [withProject, noProject],
         [{ columnId: 'labels', type: 'multiOption', operator: 'exclude', values: ['l1'] }]
      );
      expect(out).toHaveLength(2);
   });
});
