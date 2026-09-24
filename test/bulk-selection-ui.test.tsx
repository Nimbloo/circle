// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import type { IssueGroupContext } from '@/components/common/issues/group-issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { IssueLine } from '@/components/common/issues/issue-line';
import { IssueGrid } from '@/components/common/issues/issue-grid';
import { useBulkSelectionKeys } from '@/components/common/issues/use-bulk-selection-keys';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const Dnd = ({ children }: { children: React.ReactNode }) => (
   <DndProvider backend={HTML5Backend}>{children}</DndProvider>
);

/**
 * is#10: no board a seleção era invisível (sem caixa e sem destaque), Esc não limpava e
 * não havia seleção por intervalo com Shift.
 */

vi.mock('@/lib/client', () => ({ api: { issues: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});

const make = (n: number): Issue => ({
   id: `i${n}`,
   identifier: `ENG-${n}`,
   title: `Issue ${n}`,
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: String(n),
   teamId: 'ENG',
});

const ISSUES = [make(1), make(2), make(3), make(4)];
const getGroup = (): IssueGroupContext =>
   ({ group: { key: 'g', name: 'G' }, issues: ISSUES }) as never;

function EscHost() {
   useBulkSelectionKeys();
   return null;
}

beforeEach(() => {
   seedCatalog();
   useWorkspaceStore.setState({ users: [], projects: [], cycles: [] });
   useIssuesStore.setState({ issues: ISSUES });
   act(() => useBulkSelectionStore.getState().clear());
});

describe('seleção em lote (is#10)', () => {
   it('o card do board tem caixa de seleção e fica destacado quando selecionado', async () => {
      const user = userEvent.setup();
      render(
         <Dnd>
            <IssueGrid issue={ISSUES[0]} getGroup={getGroup} />
         </Dnd>
      );
      await user.click(screen.getByRole('button', { name: 'Select issue' }));
      expect([...useBulkSelectionStore.getState().selected]).toEqual(['i1']);
      expect(screen.getByRole('button', { name: 'Deselect issue' })).toBeTruthy();
      expect(
         screen.getByRole('button', { name: 'Deselect issue' }).closest('[data-issue-id]')
            ?.className
      ).toMatch(/ring/);
   });

   it('Shift+clique seleciona o intervalo do grupo', async () => {
      const user = userEvent.setup();
      render(
         <Dnd>
            {ISSUES.map((i) => (
               <IssueLine key={i.id} issue={i} getGroup={getGroup} />
            ))}
         </Dnd>
      );
      const boxes = screen.getAllByRole('button', { name: 'Select issue' });
      await user.click(boxes[0]);
      await user.keyboard('{Shift>}');
      await user.click(screen.getAllByRole('button', { name: 'Select issue' })[1]); // i3
      await user.keyboard('{/Shift}');
      expect([...useBulkSelectionStore.getState().selected].sort()).toEqual(['i1', 'i2', 'i3']);
   });

   it('Esc limpa a seleção', () => {
      render(<EscHost />);
      act(() => useBulkSelectionStore.getState().set(['i1', 'i2']));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(useBulkSelectionStore.getState().selected.size).toBe(0);
   });
});
