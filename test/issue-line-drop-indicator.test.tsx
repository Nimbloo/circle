// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { IssueLine, IssueLineDragLayer } from '@/components/common/issues/issue-line';
import type { IssueGroupContext } from '@/components/common/issues/group-issues';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from './helpers/catalog-fixture';
import { firstRank, rankAfter } from '@/lib/api/rank';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { lastTestBackend } from './helpers/dnd-test-backend';

/**
 * is#21 (parte da lista, sem a barra de lote — fica com a M): a lista reaproveitava o
 * fantasma de drag do card do board e não mostrava onde a issue cairia ao soltar.
 */

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
const urgent = priorities.find((p) => p.id === 'urgent')!;
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

const group = (issues: Issue[]): IssueGroupContext => ({
   group: {
      id: urgent.id,
      name: urgent.name,
      icon: null,
      drop: { field: 'priority', priority: urgent },
   },
   issues,
});

function Harness({ issues }: { issues: Issue[] }) {
   return (
      <DndProvider backend={HTML5Backend}>
         <IssueLineDragLayer />
         {issues.map((issue) => (
            <IssueLine key={issue.id} issue={issue} getGroup={() => group(issues)} />
         ))}
      </DndProvider>
   );
}

const rows = () => Array.from(document.querySelectorAll('[data-issue-id]'));

describe('linha de inserção e fantasma do drag na lista (is#21)', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      useIssuesStore.setState({
         issues: [make('a', { rank: r1 }), make('b', { rank: r2 })],
      });
      useWorkspaceStore.setState({ users: [], projects: [], cycles: [] });
   });

   it('paira acima da metade de cima do alvo: indicador "above"', () => {
      render(<Harness issues={useIssuesStore.getState().issues} />);
      const [rowA, rowB] = rows();
      act(() => lastTestBackend!.simulateHover(rowA, rowB, { x: 0, y: -10 }));
      const indicator = rowB.querySelector('[data-testid="drop-indicator"]');
      expect(indicator).toBeTruthy();
      expect(indicator!.className).toContain('top-0');
      act(() => lastTestBackend!.endDragWithoutDrop());
   });

   it('paira abaixo da metade de cima do alvo: indicador "below"', () => {
      render(<Harness issues={useIssuesStore.getState().issues} />);
      const [rowA, rowB] = rows();
      act(() => lastTestBackend!.simulateHover(rowA, rowB, { x: 0, y: 10 }));
      const indicator = rowB.querySelector('[data-testid="drop-indicator"]');
      expect(indicator).toBeTruthy();
      expect(indicator!.className).toContain('bottom-0');
      act(() => lastTestBackend!.endDragWithoutDrop());
   });

   it('sem arraste em curso, nenhuma linha mostra o indicador', () => {
      render(<Harness issues={useIssuesStore.getState().issues} />);
      expect(document.querySelector('[data-testid="drop-indicator"]')).toBeNull();
   });

   it('o fantasma da lista mostra o título da issue arrastada, não o card do board', () => {
      render(<Harness issues={useIssuesStore.getState().issues} />);
      const [rowA, rowB] = rows();
      act(() => lastTestBackend!.simulateHover(rowA, rowB));
      expect(document.body.textContent).toContain('Issue a');
      // Fantasma da lista é uma linha rasa (h-11), não o card do board (com "Created …").
      expect(document.body.textContent).not.toContain('Created ');
      act(() => lastTestBackend!.endDragWithoutDrop());
   });
});
