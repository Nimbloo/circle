// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HeaderNav from '@/components/layout/headers/issue/header-nav';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { Issue } from '@/data/issues';
import type { Team } from '@/data/teams';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { priorities } from '@/data/priorities';
import { useCurrentIssueStore } from '@/store/current-issue-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Auditoria de toasts (item 1): no detalhe aberto por deep-link frio (issue fora do
 * store), "Delete" e ⌘⌫ não faziam nada — `deleteIssuesWithUndo` só achava pelo store.
 * Agora exclui pela issue do contexto, com Undo, e sai da página da issue apagada.
 */

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
   }),
});

const apiMocks = vi.hoisted(() => ({ remove: vi.fn(async () => ({ deleted: true })) }));
vi.mock('@/lib/client', () => ({ api: { issues: { remove: apiMocks.remove, update: vi.fn() } } }));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', issueId: 'CORE-9' }),
   usePathname: () => '/nimbloo/issue/CORE-9',
   useRouter: () => ({ push }),
}));

const team: Team = {
   id: 'CORE',
   name: 'Core',
   icon: 'C',
   joined: true,
   color: '#000',
   estimateScale: 'fibonacci',
   cycleCooldownDays: 0,
   autoCloseParent: false,
   autoCloseChildren: false,
   parentId: null,
   members: [],
};

const cold: Issue = {
   id: 'cold-9',
   identifier: 'CORE-9',
   teamId: 'CORE',
   title: 'Aberta por deep-link',
   description: '',
   status: status[0],
   assignee: null,
   assignees: [],
   priority: priorities[0],
   labels: [],
   createdAt: '2026-09-01T00:00:00Z',
   cycleId: '',
   rank: 'a1',
};

const renderHeader = () =>
   render(
      <SidebarProvider>
         <HeaderNav />
      </SidebarProvider>
   );

const autoCloseUndoToast = () =>
   (
      toastMock.mock.calls.find(
         (c) => (c[1] as { onAutoClose?: () => void })?.onAutoClose
      )?.[1] as {
         onAutoClose: () => void;
      }
   ).onAutoClose();

describe('excluir no detalhe com a issue fora do store', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      seedCatalog();
      useWorkspaceStore.setState({ teams: [team] });
      useIssuesStore.setState({ issues: [], remoteDeletedIds: new Set() });
      act(() => useCurrentIssueStore.getState().setCurrent(cold, null));
   });

   it('menu "Delete" exclui com Undo e sai da issue apagada', async () => {
      renderHeader();
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Issue actions' }), {
         button: 0,
         ctrlKey: false,
      });
      fireEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }));

      expect(toastMock).toHaveBeenCalledWith('CORE-9 deleted', expect.anything());
      expect(push).toHaveBeenCalledWith('/nimbloo/team/CORE/all');
      await act(async () => autoCloseUndoToast());
      expect(apiMocks.remove).toHaveBeenCalledWith('cold-9');
   });

   it('⌘⌫ também exclui a issue fria e sai dela', () => {
      renderHeader();
      act(() => {
         fireEvent.keyDown(window, { key: 'Backspace', metaKey: true });
      });
      expect(toastMock).toHaveBeenCalledWith('CORE-9 deleted', expect.anything());
      expect(push).toHaveBeenCalledWith('/nimbloo/team/CORE/all');
   });
});
