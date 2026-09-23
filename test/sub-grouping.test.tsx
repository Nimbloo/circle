// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayOptions } from '@/components/layout/headers/display-options';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { planIssueDrop } from '@/components/common/issues/use-issue-drop-target';
import type { Issue } from '@/data/issues';
import type { User } from '@/data/users';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import {
   getViewDisplaySettings,
   normalizeDisplaySettings,
   useDisplaySettingsStore,
} from '@/store/display-settings-store';

vi.mock('@/lib/client', () => ({
   api: { issues: { update: vi.fn(), reorder: vi.fn() } },
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/CORE/all',
}));
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({ filters: [], setFilters: () => {}, clearFilters: () => {} }),
}));
// jsdom não tem layout: o virtualizer renderiza todas as linhas.
vi.mock('@tanstack/react-virtual', () => ({
   useVirtualizer: (opts: {
      count: number;
      estimateSize: (i: number) => number;
      getItemKey?: (i: number) => string | number;
   }) => ({
      getVirtualItems: () =>
         Array.from({ length: opts.count }, (_, index) => ({
            index,
            key: opts.getItemKey ? opts.getItemKey(index) : index,
            start: index * 44,
            size: opts.estimateSize(index),
         })),
      getTotalSize: () => opts.count * 44,
      measureElement: () => {},
      scrollToIndex: () => {},
   }),
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

const VIEW_KEY = 'team/CORE/all';
const todo = status.find((s) => s.id === 'to-do')!;
const urgent = priorities.find((p) => p.id === 'urgent')!;
const low = priorities.find((p) => p.id === 'low')!;
const ana: User = {
   id: 'ana',
   name: 'Ana',
   email: 'ana@nimbloo.ai',
   avatarUrl: '',
} as User;
const bia: User = { ...ana, id: 'bia', name: 'Bia', email: 'bia@nimbloo.ai' };

function issue(partial: Partial<Issue> & { id: string; title: string }): Issue {
   return {
      identifier: partial.id,
      teamId: 'CORE',
      description: '',
      status: todo,
      assignee: null,
      assignees: [],
      priority: urgent,
      labels: [],
      createdAt: '2026-09-01T00:00:00Z',
      cycleId: '',
      rank: partial.id,
      ...partial,
   };
}

const i1 = issue({ id: 'CORE-1', title: 'Um', priority: urgent });
const i2 = issue({ id: 'CORE-2', title: 'Dois', priority: urgent });
const i3 = issue({ id: 'CORE-3', title: 'Tres', priority: low });
const all = [i1, i2, i3];

const store = () => useDisplaySettingsStore.getState();
const current = () => getViewDisplaySettings(store().byView, VIEW_KEY);

describe('sub-agrupamento: store', () => {
   beforeEach(() => useDisplaySettingsStore.setState({ byView: {} }));

   it('default e leitura antiga sem o campo = No grouping', () => {
      expect(current().subGrouping).toBe('none');
      expect(normalizeDisplaySettings({ grouping: 'assignee' }).subGrouping).toBe('none');
   });

   it('persiste por view e descarta sub-grupo igual ao grupo', () => {
      store().setSubGrouping(VIEW_KEY, 'priority');
      expect(current().subGrouping).toBe('priority');
      expect(getViewDisplaySettings(store().byView, 'my-issues').subGrouping).toBe('none');
      expect(
         normalizeDisplaySettings({ grouping: 'priority', subGrouping: 'priority' }).subGrouping
      ).toBe('none');
      expect(normalizeDisplaySettings({ subGrouping: 'bogus' as never }).subGrouping).toBe('none');
   });

   it('grupo principal na mesma dimensão do sub-grupo reseta o sub-grupo', () => {
      store().setSubGrouping(VIEW_KEY, 'assignee');
      store().setGrouping(VIEW_KEY, 'priority');
      expect(current().subGrouping).toBe('assignee');
      store().setGrouping(VIEW_KEY, 'assignee');
      expect(current().grouping).toBe('assignee');
      expect(current().subGrouping).toBe('none');
   });

   it('snapshot do servidor sem o campo mantém o sub-grupo local', () => {
      store().setSubGrouping(VIEW_KEY, 'assignee');
      store().hydrateByView({ [VIEW_KEY]: { grouping: 'status', ordering: 'created' } });
      expect(current().ordering).toBe('created');
      expect(current().subGrouping).toBe('assignee');
      store().hydrateByView({});
      expect(current().subGrouping).toBe('assignee');
      store().hydrateByView({ [VIEW_KEY]: { grouping: 'assignee' } });
      expect(current().subGrouping).toBe('none');
   });

   it('sem agrupamento principal não há sub-grupo', () => {
      store().setSubGrouping(VIEW_KEY, 'assignee');
      store().setGrouping(VIEW_KEY, 'none');
      expect(current().subGrouping).toBe('none');
   });
});

describe('sub-agrupamento: popover Display', () => {
   beforeEach(() => useDisplaySettingsStore.setState({ byView: {} }));

   it('o select está habilitado e lista as dimensões menos a do grupo principal', async () => {
      const user = userEvent.setup();
      render(<DisplayOptions />);
      await user.click(screen.getByRole('button', { name: 'Display options' }));

      const select = screen.getByRole('combobox', { name: 'Sub-grouping' });
      expect(select.hasAttribute('disabled')).toBe(false);
      await user.click(select);
      const options = screen.getAllByRole('option').map((o) => o.textContent);
      expect(options).toEqual(['Assignee', 'Priority', 'Project', 'Label', 'No grouping']);

      await user.click(screen.getByRole('option', { name: 'Assignee' }));
      expect(current().subGrouping).toBe('assignee');
   });
});

describe('sub-agrupamento: lista e board', () => {
   beforeEach(() => {
      seedCatalog();
      useDisplaySettingsStore.setState({ byView: {} });
      store().setSubGrouping(VIEW_KEY, 'priority');
   });

   it('lista: cabeçalhos de sub-grupo com contagem, colapsáveis', async () => {
      render(
         <GroupedIssuesView
            issues={all}
            totalIssues={all}
            statuses={[todo]}
            isViewTypeGrid={false}
         />
      );
      const urgentHeader = screen.getByRole('button', { name: /Urgent/ });
      expect(urgentHeader.textContent).toContain('2');
      const lowHeader = screen.getByRole('button', { name: /Low/ });
      expect(lowHeader.textContent).toContain('1');
      expect(screen.getByText('Tres')).toBeTruthy();

      await userEvent.setup().click(lowHeader);
      expect(lowHeader.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText('Tres')).toBeNull();
      expect(screen.getByText('Um')).toBeTruthy();
   });

   it('lista: o grupo principal também colapsa (esconde sub-grupos e issues)', async () => {
      render(
         <GroupedIssuesView
            issues={all}
            totalIssues={all}
            statuses={[todo]}
            isViewTypeGrid={false}
         />
      );
      const groupHeader = screen.getByRole('button', { name: new RegExp(todo.name) });
      expect(groupHeader.getAttribute('aria-expanded')).toBe('true');
      await userEvent.setup().click(groupHeader);
      expect(groupHeader.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText('Um')).toBeNull();
      expect(screen.queryByRole('button', { name: /Urgent/ })).toBeNull();
   });

   it('board: swimlanes por sub-grupo, colapsáveis', async () => {
      render(<GroupedIssuesView issues={all} totalIssues={all} statuses={[todo]} isViewTypeGrid />);
      const lanes = screen.getAllByTestId('board-swimlane');
      expect(lanes).toHaveLength(2);
      const urgentLane = within(lanes[0]).getByRole('button', { name: /Urgent/ });
      expect(urgentLane.textContent).toContain('2');
      expect(within(lanes[0]).getByText('Um')).toBeTruthy();
      expect(within(lanes[1]).getByText('Tres')).toBeTruthy();
      // Sem virtualização 2D: cada card pula layout/pintura fora da tela.
      const card = within(lanes[0]).getByText('Um').closest('[data-slot="swimlane-card"]');
      expect(card?.className).toContain('[content-visibility:auto]');

      await userEvent.setup().click(urgentLane);
      expect(within(lanes[0]).queryByText('Um')).toBeNull();
   });
});

describe('sub-agrupamento: drag-and-drop entre swimlanes', () => {
   const inProgress = status.find((s) => s.id !== todo.id)!;
   const cell = (issues: Issue[]) => ({
      group: {
         id: `${inProgress.id}::bia`,
         name: 'Bia',
         icon: null,
         drop: { field: 'status' as const, status: inProgress },
         subDrop: { field: 'assignee' as const, assignee: bia },
      },
      issues,
   });

   it('soltar em outra swimlane muda o grupo principal e o sub-grupo', () => {
      const item = issue({ id: 'X', title: 'X', assignee: ana, assignees: [ana] });
      expect(
         planIssueDrop({
            item,
            target: cell([]),
            targetIssueId: null,
            dropAbove: false,
            ordering: 'manual',
         })
      ).toEqual({
         kind: 'move',
         value: { field: 'status', status: inProgress },
         subValue: { field: 'assignee', assignee: bia },
      });
   });

   it('sub-grupo já igual: só o grupo principal', () => {
      const item = issue({ id: 'X', title: 'X', assignee: bia, assignees: [bia] });
      const plan = planIssueDrop({
         item,
         target: cell([]),
         targetIssueId: null,
         dropAbove: false,
         ordering: 'manual',
      });
      expect(plan).toEqual({ kind: 'move', value: { field: 'status', status: inProgress } });
   });
});
