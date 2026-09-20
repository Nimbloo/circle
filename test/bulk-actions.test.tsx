// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { BulkActionsBar } from '@/components/common/issues/bulk-actions-bar';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import type { Issue } from '@/data/issues';
import type { User } from '@/data/users';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const apiMocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }));
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
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

const user = (id: string, name: string, deactivatedAt: string | null = null): User => ({
   id,
   name,
   email: `${id}@nimbloo.ai`,
   avatarUrl: '',
   status: 'online',
   role: 'Member',
   joinedDate: '2026-01-01',
   teamIds: ['ENG'],
   timezone: 'UTC',
   deactivatedAt,
});

const make = (id: string): Issue => ({
   id,
   identifier: `ENG-${id}`,
   title: id,
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: id,
   teamId: 'ENG',
});

beforeEach(() => {
   seedCatalog();
   vi.clearAllMocks();
   useIssuesStore.setState({ issues: [make('a'), make('b')] });
   useWorkspaceStore.setState({
      users: [user('u1', 'Ana'), user('u2', 'Zeca', '2026-02-01')],
      projects: [],
      cycles: [],
      teams: [],
   });
   useBulkSelectionStore.getState().set(['a', 'b']);
});

describe('#30 ações em lote', () => {
   it('sucesso: um toast só e o popover fecha', async () => {
      apiMocks.update.mockResolvedValue({});
      const u = userEvent.setup();
      render(<BulkActionsBar />);
      await u.click(screen.getByRole('button', { name: /Priority/ }));
      await u.click(await screen.findByRole('option', { name: /Urgent/ }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
      expect(apiMocks.update).toHaveBeenCalledTimes(2);
      expect(screen.queryByPlaceholderText('Set priority...')).toBeNull();
   });

   it('falha parcial: um toast de erro agregado, nenhum de sucesso', async () => {
      apiMocks.update.mockImplementation(async (id: string) => {
         if (id === 'b') throw new Error('x');
         return {};
      });
      const u = userEvent.setup();
      render(<BulkActionsBar />);
      await u.click(screen.getByRole('button', { name: /Priority/ }));
      await u.click(await screen.findByRole('option', { name: /Urgent/ }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(toast.success).not.toHaveBeenCalled();
      const ids = new Set(
         vi.mocked(toast.error).mock.calls.map((c) => (c[1] as { id?: string })?.id)
      );
      expect(ids.size).toBe(1);
      expect(vi.mocked(toast.error).mock.lastCall?.[0]).toContain('1 de 2');
   });

   it('membros desativados não aparecem no seletor de responsável', async () => {
      const u = userEvent.setup();
      render(<BulkActionsBar />);
      await u.click(screen.getByRole('button', { name: /Assignee/ }));
      expect(await screen.findByRole('option', { name: /Ana/ })).toBeTruthy();
      expect(screen.queryByRole('option', { name: /Zeca/ })).toBeNull();
   });

   it('seleção é podada quando a issue some da lista', () => {
      const { rerender } = render(
         <GroupedIssuesView
            issues={[make('a'), make('b')]}
            totalIssues={[make('a'), make('b')]}
            statuses={status}
            isViewTypeGrid={false}
         />
      );
      expect(useBulkSelectionStore.getState().selected.size).toBe(2);
      act(() => {
         rerender(
            <GroupedIssuesView
               issues={[make('a')]}
               totalIssues={[make('a')]}
               statuses={status}
               isViewTypeGrid={false}
            />
         );
      });
      expect([...useBulkSelectionStore.getState().selected]).toEqual(['a']);
   });
});
