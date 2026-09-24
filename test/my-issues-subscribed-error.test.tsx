// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Auditoria de toasts (item 12): na aba Subscribed, a falha ao buscar a lista completa de
 * assinaturas (as fechadas vêm sob demanda) era engolida — a tela mostrava só as abertas
 * como se fosse tudo. Agora avisa, com retry.
 */

const apiMocks = vi.hoisted(() => ({
   issues: { list: vi.fn(async () => []) },
   me: { subscriptions: vi.fn(), activity: vi.fn(async () => []) },
}));
vi.mock('@/lib/client', () => ({ api: apiMocks }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
const tabState = vi.hoisted(() => ({ tab: 'subscribed' }));
vi.mock('nuqs', () => ({
   parseAsStringLiteral: () => ({ withDefault: () => ({}) }),
   useQueryState: () => [tabState.tab, () => {}],
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/my-issues',
}));
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({ filters: [], setFilters: () => {}, clearFilters: () => {} }),
}));
vi.mock('@/components/common/issues/issue-filter-bar', () => ({ IssueFilterBar: () => null }));
vi.mock('@/components/common/issues/grouped-issues-view', () => ({
   GroupedIssuesView: () => null,
}));

const { default: MyIssues } = await import('@/components/common/my-issues/my-issues');

beforeEach(() => {
   vi.clearAllMocks();
   tabState.tab = 'subscribed';
   useWorkspaceStore.setState({
      me: {
         id: 'u-me',
         slug: 'eu',
         name: 'Eu',
         email: 'eu@nimbloo.ai',
         avatarUrl: null,
         role: 'Member',
         admin: false,
         teamIds: ['ENG'],
         subscribedIssueIds: [],
         githubLogin: null,
      },
   });
   useIssuesStore.setState({ issues: [], loading: false, loaded: true, error: false });
});

describe('My issues > Subscribed — falha na lista completa', () => {
   it('avisa com toast de erro e retry que busca de novo', async () => {
      apiMocks.me.subscriptions.mockRejectedValueOnce(new Error('Failed to fetch'));
      render(<MyIssues />);
      await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
      const [message, opts] = toastMock.error.mock.calls[0] as [
         string,
         { id?: string; action?: { label: string; onClick: () => void } },
      ];
      expect(message).toMatch(/assinaturas/);
      expect(opts.id).toBeTruthy();
      expect(opts.action?.label).toBe('Tentar novamente');

      apiMocks.me.subscriptions.mockResolvedValueOnce({ issueIds: ['x'] });
      await act(async () => opts.action?.onClick());
      await waitFor(() => expect(apiMocks.me.subscriptions).toHaveBeenCalledTimes(2));
   });

   it('sucesso não mostra toast', async () => {
      apiMocks.me.subscriptions.mockResolvedValue({ issueIds: [] });
      render(<MyIssues />);
      await waitFor(() => expect(apiMocks.me.subscriptions).toHaveBeenCalled());
      expect(toastMock.error).not.toHaveBeenCalled();
   });

   it('sair da aba ou desmontar dispensa o toast (o Retry só roda na aba) — CodeRabbit #190', async () => {
      apiMocks.me.subscriptions.mockRejectedValueOnce(new Error('Failed to fetch'));
      const { rerender, unmount } = render(<MyIssues />);
      await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
      const id = (toastMock.error.mock.calls[0][1] as { id: string }).id;
      expect(toastMock.dismiss).not.toHaveBeenCalledWith(id);

      tabState.tab = 'assigned';
      rerender(<MyIssues />);
      expect(toastMock.dismiss).toHaveBeenCalledWith(id);

      toastMock.dismiss.mockClear();
      apiMocks.me.subscriptions.mockRejectedValueOnce(new Error('Failed to fetch'));
      tabState.tab = 'subscribed';
      rerender(<MyIssues />);
      await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(2));
      unmount();
      expect(toastMock.dismiss).toHaveBeenCalledWith(id);
   });
});
