// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Aba Activity de My issues: enquanto `/me/activity` carrega a tela mostrava "Nenhuma
 * issue", e a falha era engolida (vazio para sempre, sem retry).
 */

const apiMocks = vi.hoisted(() => ({
   issues: { list: vi.fn(async () => []) },
   me: { subscriptions: vi.fn(async () => ({ issueIds: [] })), activity: vi.fn() },
}));
vi.mock('@/lib/client', () => ({ api: apiMocks }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }));
vi.mock('nuqs', () => ({
   parseAsStringLiteral: () => ({ withDefault: () => ({}) }),
   useQueryState: () => ['activity', () => {}],
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/my-issues',
}));
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({ filters: [], setFilters: () => {}, clearFilters: () => {} }),
}));
vi.mock('@/components/common/issues/issue-filter-bar', () => ({ IssueFilterBar: () => null }));
type ViewProps = { loading?: boolean; error?: boolean; onRetry?: () => void };
const viewProps = vi.hoisted(() => ({ last: null as ViewProps | null }));
vi.mock('@/components/common/issues/grouped-issues-view', () => ({
   GroupedIssuesView: (props: ViewProps) => {
      viewProps.last = props;
      return null;
   },
}));

const { default: MyIssues } = await import('@/components/common/my-issues/my-issues');

beforeEach(() => {
   vi.clearAllMocks();
   viewProps.last = null;
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

describe('My issues > Activity — carregando e erro', () => {
   it('mostra carregando enquanto /me/activity não responde', async () => {
      let resolve!: (v: unknown[]) => void;
      apiMocks.me.activity.mockReturnValue(new Promise((r) => (resolve = r)));
      render(<MyIssues />);
      expect(viewProps.last?.loading).toBe(true);
      await act(async () => resolve([]));
      await waitFor(() => expect(viewProps.last?.loading).toBe(false));
   });

   it('falha vira estado de erro, e o retry busca de novo', async () => {
      apiMocks.me.activity.mockRejectedValueOnce(new Error('Failed to fetch'));
      render(<MyIssues />);
      await waitFor(() => expect(viewProps.last?.error).toBe(true));
      expect(viewProps.last?.loading).toBe(false);

      apiMocks.me.activity.mockResolvedValueOnce([]);
      await act(async () => viewProps.last?.onRetry?.());
      await waitFor(() => expect(apiMocks.me.activity).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(viewProps.last?.error).toBe(false));
   });
});
