// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { IssueLine } from '@/components/common/issues/issue-line';
import type { IssueGroupContext } from '@/components/common/issues/group-issues';
import { planIssueDrop } from '@/components/common/issues/use-issue-drop-target';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { firstRank, rankAfter } from '@/lib/api/rank';
import { getViewDisplaySettings, useDisplaySettingsStore } from '@/store/display-settings-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { lastTestBackend } from './helpers/dnd-test-backend';

const apiMocks = vi.hoisted(() => ({ update: vi.fn(), reorder: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: { issues: { update: apiMocks.update, reorder: apiMocks.reorder } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

const r1 = firstRank();
const r2 = rankAfter(r1);
const r3 = rankAfter(r2);
const urgent = priorities.find((p) => p.id === 'urgent')!;
const low = priorities.find((p) => p.id === 'low')!;
const todo = status.find((s) => s.id === 'to-do')!;

const make = (id: string, over: Partial<Issue> = {}): Issue => ({
   id,
   identifier: `ENG-${id}`,
   title: `Issue ${id}`,
   description: '',
   status: todo,
   priority: urgent,
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: id,
   teamId: 'ENG',
   ...over,
});

const priorityGroup = (priority: typeof urgent, issues: Issue[]): IssueGroupContext => ({
   group: {
      id: priority.id,
      name: priority.name,
      icon: null,
      drop: { field: 'priority', priority },
   },
   issues,
});

describe('planIssueDrop (R2)', () => {
   const a = make('a', { rank: r1 });
   const b = make('b', { rank: r2 });
   const c = make('c', { rank: r3 });

   it('mesmo grupo em ordenação manual: vizinhos por rank', () => {
      const plan = planIssueDrop({
         item: a,
         target: priorityGroup(urgent, [a, b, c]),
         targetIssueId: 'c',
         dropAbove: false,
         ordering: 'manual',
      });
      expect(plan).toEqual({
         kind: 'reorder',
         beforeId: 'c',
         afterId: null,
         switchToManual: false,
      });
   });

   it('mesmo grupo em outra ordenação: vizinhos pela ordem de rank e troca para manual', () => {
      // Exibição por prioridade poderia ser [c, a, b]; o reorder usa a ordem de rank.
      const plan = planIssueDrop({
         item: c,
         target: priorityGroup(urgent, [c, a, b]),
         targetIssueId: 'a',
         dropAbove: false,
         ordering: 'priority',
      });
      expect(plan).toEqual({ kind: 'reorder', beforeId: 'a', afterId: 'b', switchToManual: true });
   });

   it('outro grupo: muda o campo do agrupamento (prioridade)', () => {
      const d = make('d', { priority: low });
      const plan = planIssueDrop({
         item: d,
         target: priorityGroup(urgent, [a]),
         targetIssueId: 'a',
         dropAbove: true,
         ordering: 'manual',
      });
      expect(plan).toEqual({ kind: 'move', value: { field: 'priority', priority: urgent } });
   });

   it('coluna vazia de outro grupo aceita o drop', () => {
      const plan = planIssueDrop({
         item: a,
         target: priorityGroup(low, []),
         targetIssueId: null,
         dropAbove: false,
         ordering: 'priority',
      });
      expect(plan).toEqual({ kind: 'move', value: { field: 'priority', priority: low } });
   });

   it('grupo sem campo de destino (label) recusa', () => {
      const plan = planIssueDrop({
         item: a,
         target: { group: { id: 'l1', name: 'Bug', icon: null }, issues: [b] },
         targetIssueId: 'b',
         dropAbove: false,
         ordering: 'manual',
      });
      expect(plan).toEqual({ kind: 'none' });
   });
});

describe('reorderIssue com vizinhos invertidos', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      apiMocks.reorder.mockImplementation(() => new Promise(() => {}));
   });

   it('não lança e mantém a issue entre os dois', () => {
      useIssuesStore.setState({
         issues: [make('a', { rank: r1 }), make('b', { rank: r2 }), make('c', { rank: r3 })],
      });
      // before > after (lista velha no cliente): LexoRank.between lançaria.
      expect(() => useIssuesStore.getState().reorderIssue('a', 'c', 'b')).not.toThrow();
      const moved = useIssuesStore.getState().issues.find((i) => i.id === 'a')!;
      expect(moved.rank > r2 && moved.rank < r3).toBe(true);
      expect(apiMocks.reorder).toHaveBeenCalledWith('a', 'c', 'b');
   });
});

describe('arraste na lista com ordenação padrão (priority)', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      useDisplaySettingsStore.setState({ byView: {} });
      useWorkspaceStore.setState({ users: [], projects: [], cycles: [] });
      apiMocks.update.mockImplementation(async () => ({}));
      apiMocks.reorder.mockImplementation(() => new Promise(() => {}));
   });

   function Harness() {
      const issues = useIssuesStore((s) => s.issues);
      const latest = React.useRef(issues);
      latest.current = issues;
      const getUrgent = React.useCallback(
         () =>
            priorityGroup(
               urgent,
               latest.current.filter((i) => i.priority.id === 'urgent')
            ),
         []
      );
      const getLow = React.useCallback(
         () =>
            priorityGroup(
               low,
               latest.current.filter((i) => i.priority.id === 'low')
            ),
         []
      );
      return (
         <DndProvider backend={HTML5Backend}>
            {issues.map((issue) => (
               <IssueLine
                  key={issue.id}
                  issue={issue}
                  getGroup={issue.priority.id === 'urgent' ? getUrgent : getLow}
               />
            ))}
         </DndProvider>
      );
   }
   const rows = () => Array.from(document.querySelectorAll('[class*="group/line"]'));
   const ordering = () =>
      getViewDisplaySettings(useDisplaySettingsStore.getState().byView, 'team/ENG/all').ordering;

   it('reordenar no mesmo grupo troca a ordenação para manual e grava o rank', async () => {
      useIssuesStore.setState({
         issues: [make('a', { rank: r1 }), make('b', { rank: r2 }), make('c', { rank: r3 })],
      });
      render(<Harness />);
      const [rowA, , rowC] = rows();
      act(() => lastTestBackend!.simulateDragDrop(rowA, rowC));
      await waitFor(() => expect(apiMocks.reorder).toHaveBeenCalledWith('a', 'c', null));
      expect(ordering()).toBe('manual');
   });

   it('soltar em outro grupo de prioridade muda a prioridade, não o status', async () => {
      useIssuesStore.setState({
         issues: [make('a', { rank: r1 }), make('b', { rank: r2, priority: low })],
      });
      render(<Harness />);
      const [rowA, rowB] = rows();
      act(() => lastTestBackend!.simulateDragDrop(rowA, rowB));
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith('a', { priorityId: 'low' }));
      expect(useIssuesStore.getState().issues.find((i) => i.id === 'a')!.status.id).toBe('to-do');
      expect(apiMocks.reorder).not.toHaveBeenCalled();
   });
});
