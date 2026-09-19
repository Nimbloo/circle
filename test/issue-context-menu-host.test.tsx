// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const apiMocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }));
const menuRenders = vi.hoisted(() => ({ ids: [] as (string | undefined)[] }));

vi.mock('@/lib/client', () => ({
   api: { issues: { update: apiMocks.update, remove: apiMocks.remove } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({ filters: [], setFilters: () => {}, clearFilters: () => {} }),
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});
vi.mock('@tanstack/react-virtual', () => ({
   useVirtualizer: (opts: { count: number; getItemKey?: (i: number) => React.Key }) => ({
      getTotalSize: () => opts.count * 44,
      getVirtualItems: () =>
         Array.from({ length: opts.count }, (_, index) => ({
            index,
            key: opts.getItemKey ? opts.getItemKey(index) : index,
            start: index * 44,
         })),
      measureElement: () => {},
      scrollToIndex: () => {},
   }),
}));
vi.mock('@/components/common/issues/issue-context-menu', async (orig) => {
   const actual = await orig<typeof import('@/components/common/issues/issue-context-menu')>();
   return {
      ...actual,
      IssueContextMenu: (props: { issueId?: string }) => {
         menuRenders.ids.push(props.issueId);
         return <actual.IssueContextMenu {...props} />;
      },
   };
});
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

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
   rank: `a${n}`,
   teamId: 'ENG',
});
const issues = [make(1), make(2), make(3)];

beforeEach(() => {
   vi.clearAllMocks();
   menuRenders.ids = [];
   useDisplaySettingsStore.setState({ byView: {} });
   useIssuesStore.setState({ issues });
   useWorkspaceStore.setState({ users: [], projects: [], cycles: [], teams: [] });
});

const view = () => (
   <GroupedIssuesView
      issues={issues}
      totalIssues={issues}
      statuses={status}
      isViewTypeGrid={false}
   />
);

describe('R7 menu de contexto único no nível da lista', () => {
   it('uma instância para a lista inteira, ligada à linha clicada', async () => {
      render(view());
      expect(new Set(menuRenders.ids).size).toBeLessThanOrEqual(1);
      fireEvent.contextMenu(screen.getByText('Issue 2'));
      await waitFor(() => expect(menuRenders.ids.at(-1)).toBe('i2'));
      expect(await screen.findByText('Delete...')).toBeTruthy();
   });

   it('Is#13: excluir só toasta sucesso depois da API', async () => {
      apiMocks.remove.mockRejectedValue(new Error('x'));
      render(view());
      fireEvent.contextMenu(screen.getByText('Issue 2'));
      await userEvent.setup().click(await screen.findByText('Delete...'));
      await userEvent.setup().click(await screen.findByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledWith('i2'));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(toast.success).not.toHaveBeenCalled();
   });
});
