// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import {
   applyIssueFilters,
   SUB_ISSUES_ONLY_SUB,
   SUB_ISSUES_TOP_LEVEL,
   SUB_ISSUES_WITH_SUB,
} from '@/components/common/issues/issue-filter-columns';
import type { Issue } from '@/data/issues';
import { status } from '@/data/status';
import { priorities } from '@/data/priorities';
import { useDisplaySettingsStore } from '@/store/display-settings-store';

vi.mock('@/lib/client', () => ({
   api: { issues: { update: vi.fn(), reorder: vi.fn() } },
}));

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/CORE/all',
}));

// A barra de filtros vive na URL (nuqs) — fora do escopo aqui: sem filtros ativos.
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({ filters: [], setFilters: () => {}, clearFilters: () => {} }),
}));

// jsdom não tem layout: o virtualizer renderiza todas as linhas.
vi.mock('@tanstack/react-virtual', () => ({
   useVirtualizer: (opts: { count: number; estimateSize: (i: number) => number }) => ({
      getVirtualItems: () =>
         Array.from({ length: opts.count }, (_, index) => ({
            index,
            key: index,
            start: index * 44,
            size: opts.estimateSize(index),
         })),
      getTotalSize: () => opts.count * 44,
      measureElement: () => {},
   }),
}));

vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

const todo = status.find((s) => s.id === 'to-do') ?? status[0];

function issue(partial: Partial<Issue> & { id: string; title: string }): Issue {
   return {
      identifier: partial.id,
      teamId: 'CORE',
      description: '',
      status: todo,
      assignee: null,
      assignees: [],
      priority: priorities[0],
      labels: [],
      createdAt: '2026-09-01T00:00:00Z',
      cycleId: '',
      rank: partial.id,
      ...partial,
   };
}

const parent = issue({ id: 'CORE-1', title: 'Pai da lista', subIssueCount: 1 });
const child = issue({
   id: 'CORE-2',
   title: 'Filha da lista',
   parentId: 'CORE-1',
   parentIdentifier: 'CORE-1',
});
const loner = issue({ id: 'CORE-3', title: 'Solta' });

const VIEW_KEY = 'team/CORE/all';

describe('listas com sub-issues (#95)', () => {
   beforeEach(() => {
      useDisplaySettingsStore.setState({ byView: {} });
   });

   it('a linha da sub-issue mostra o chip do pai e o toggle "Show sub-issues" esconde as filhas', () => {
      render(
         <GroupedIssuesView
            issues={[parent, child, loner]}
            totalIssues={[parent, child, loner]}
            statuses={[todo]}
            isViewTypeGrid={false}
         />
      );

      expect(screen.getByText('Filha da lista')).toBeTruthy();
      const chips = screen.getAllByTestId('parent-issue-chip');
      expect(chips).toHaveLength(1);
      expect(chips[0].textContent).toBe('CORE-1');

      act(() => useDisplaySettingsStore.getState().setShowSubIssues(VIEW_KEY, false));
      expect(screen.queryByText('Filha da lista')).toBeNull();
      expect(screen.queryByTestId('parent-issue-chip')).toBeNull();
      expect(screen.getByText('Pai da lista')).toBeTruthy();
      expect(screen.getByText('Solta')).toBeTruthy();
      // É opção de display, não filtro: nada de "hidden by filters".
      expect(screen.queryByText(/hidden by filters/)).toBeNull();

      act(() => useDisplaySettingsStore.getState().setShowSubIssues(VIEW_KEY, true));
      expect(screen.getByText('Filha da lista')).toBeTruthy();
   });

   it('filtro "Sub-issues": Top-level only / Only sub-issues / With sub-issues', () => {
      const all = [parent, child, loner];
      const ids = (list: Issue[]) => list.map((i) => i.id);
      expect(
         ids(
            applyIssueFilters(all, [
               {
                  columnId: 'subIssues',
                  type: 'multiOption',
                  operator: 'include',
                  values: [SUB_ISSUES_TOP_LEVEL],
               },
            ])
         )
      ).toEqual(['CORE-1', 'CORE-3']);
      expect(
         ids(
            applyIssueFilters(all, [
               {
                  columnId: 'subIssues',
                  type: 'multiOption',
                  operator: 'include',
                  values: [SUB_ISSUES_ONLY_SUB],
               },
            ])
         )
      ).toEqual(['CORE-2']);
      expect(
         ids(
            applyIssueFilters(all, [
               {
                  columnId: 'subIssues',
                  type: 'multiOption',
                  operator: 'include',
                  values: [SUB_ISSUES_WITH_SUB],
               },
            ])
         )
      ).toEqual(['CORE-1']);
   });
});
