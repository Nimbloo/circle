// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchIssues } from '@/components/common/issues/search-issues';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useSearchStore } from '@/store/search-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const apiMocks = vi.hoisted(() => ({
   search: vi.fn(),
   get: vi.fn(),
   createView: vi.fn(),
}));
vi.mock('@/lib/client', () => ({
   api: {
      issues: { get: apiMocks.get },
      search: { query: apiMocks.search },
      views: { create: apiMocks.createView },
   },
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

const makeIssue = (over: Partial<Issue> & { id: string }): Issue => ({
   identifier: `ENG-${over.id}`,
   title: `Issue ${over.id}`,
   description: '',
   status: status[0],
   priority: priorities.find((p) => p.id === 'no-priority')!,
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: over.id,
   teamId: 'ENG',
   ...over,
});

const dtoOf = (issue: Issue) => ({
   id: issue.id,
   identifier: issue.identifier,
   teamId: 'ENG',
   title: issue.title,
   status: {
      id: issue.status.id,
      name: issue.status.name,
      color: '',
      category: issue.status.category,
   },
   priority: { id: issue.priority.id, name: issue.priority.name },
   assignee: null,
   createdBy: null,
   project: null,
   cycleId: '',
   labels: [],
   rank: issue.rank,
   dueDate: null,
   estimate: null,
   subIssueCount: 0,
   subIssueDoneCount: 0,
   snoozedUntil: null,
   createdAt: issue.createdAt,
   updatedAt: issue.createdAt,
});

const itemOf = (issue: Issue, snippet = '') => ({
   id: issue.id,
   identifier: issue.identifier,
   title: issue.title,
   snippet,
   rank: 1,
   teamId: 'ENG',
   statusId: issue.status.id,
   url: `/issue/${issue.identifier}`,
});

const result = (groups: unknown[]) => ({
   query: 'login',
   groups,
   fallback: false,
   semantic: false,
});

describe('SearchIssues — resultados agrupados da busca full-text', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      useSearchStore.setState({ isSearchOpen: true, searchQuery: 'login' });
      useWorkspaceStore.setState({ teams: [], projects: [], users: [] });
   });

   it('a linha reflete uma mutação do store (não é uma cópia local do fetch)', async () => {
      const a = makeIssue({ id: 'a', title: 'Login quebrado' });
      useIssuesStore.setState({ issues: [a] });
      apiMocks.search.mockResolvedValue(result([{ type: 'issue', items: [itemOf(a)] }]));

      render(<SearchIssues />);
      await screen.findByText('Issues (1)');
      expect(screen.getByText('Login quebrado')).toBeTruthy();
      expect(screen.getByLabelText('Change priority: No priority')).toBeTruthy();

      const high = priorities.find((p) => p.id === 'high')!;
      act(() => {
         useIssuesStore.setState((s) => ({
            issues: s.issues.map((i) => (i.id === 'a' ? { ...i, priority: high } : i)),
         }));
      });
      expect(screen.getByLabelText('Change priority: High')).toBeTruthy();
      expect(apiMocks.search).toHaveBeenCalledWith({
         q: 'login',
         types: undefined,
         teamId: undefined,
         statusId: undefined,
         limit: 30,
      });
   });

   it('resultado ausente do store entra por applyRemote e aparece', async () => {
      useIssuesStore.setState({ issues: [] });
      const b = makeIssue({ id: 'b', title: 'Login por SSO' });
      apiMocks.search.mockResolvedValue(result([{ type: 'issue', items: [itemOf(b)] }]));
      apiMocks.get.mockResolvedValue(dtoOf(b));

      render(<SearchIssues />);
      await screen.findByText('Login por SSO');
      expect(apiMocks.get).toHaveBeenCalledWith('b');
      expect(useIssuesStore.getState().getIssueById('b')).toBeDefined();
   });

   it('agrupa por tipo e destaca o snippet com <mark>', async () => {
      const a = makeIssue({ id: 'a', title: 'Login quebrado' });
      useIssuesStore.setState({ issues: [a] });
      apiMocks.search.mockResolvedValue(
         result([
            { type: 'issue', items: [itemOf(a, 'falha no <mark>login</mark> do app')] },
            {
               type: 'project',
               items: [
                  {
                     id: 'p1',
                     identifier: null,
                     title: 'Portal de login',
                     snippet: 'reescrita do <mark>login</mark>',
                     rank: 1,
                     teamId: 'ENG',
                     statusId: null,
                     url: '/project/p1/overview',
                  },
               ],
            },
            {
               type: 'document',
               items: [
                  {
                     id: 'd1',
                     identifier: null,
                     title: 'Runbook de login',
                     snippet: '',
                     rank: 1,
                     teamId: 'ENG',
                     statusId: null,
                     url: '/team/ENG/documents',
                  },
               ],
            },
         ])
      );

      render(<SearchIssues />);
      await screen.findByText('Issues (1)');
      expect(screen.getByText('Projects (1)')).toBeTruthy();
      expect(screen.getByText('Documents (1)')).toBeTruthy();

      const marks = document.querySelectorAll('mark');
      expect(marks.length).toBe(2);
      expect([...marks].map((m) => m.textContent)).toEqual(['login', 'login']);

      const projectLink = screen.getByText('Portal de login').closest('a');
      expect(projectLink?.getAttribute('href')).toBe('/nimbloo/project/p1/overview');
   });

   it('o chip Type recorta a consulta', async () => {
      const u = userEvent.setup({ pointerEventsCheck: 0 });
      useIssuesStore.setState({ issues: [] });
      apiMocks.search.mockResolvedValue(result([]));
      render(<SearchIssues />);
      await waitFor(() => expect(apiMocks.search).toHaveBeenCalledTimes(1));

      await u.click(screen.getByRole('button', { name: 'Type' }));
      await u.click(await screen.findByRole('menuitemcheckbox', { name: 'Projects' }));

      await waitFor(() =>
         expect(apiMocks.search).toHaveBeenLastCalledWith(
            expect.objectContaining({ types: ['project'] })
         )
      );
   });

   it('Save search cria a view com o termo e só toasta depois da API', async () => {
      useIssuesStore.setState({ issues: [] });
      apiMocks.search.mockResolvedValue(result([]));
      let resolveCreate: (v: unknown) => void = () => {};
      apiMocks.createView.mockReturnValue(
         new Promise((res) => {
            resolveCreate = res;
         })
      );

      render(<SearchIssues />);
      fireEvent.click(screen.getByLabelText('Save search'));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByText('Save'));

      await waitFor(() => expect(apiMocks.createView).toHaveBeenCalledTimes(1));
      expect(apiMocks.createView.mock.calls[0][0]).toMatchObject({
         name: 'login',
         type: 'issue',
         filter: { q: 'login' },
      });
      // Ainda pendente: nada de toast de sucesso "no clique".
      expect(toastMocks.success).not.toHaveBeenCalled();

      await act(async () => {
         resolveCreate({
            id: 'v1',
            slug: 'login-1',
            name: 'login',
            description: null,
            icon: null,
            type: 'issue',
            teamId: null,
            ownerId: 'u1',
            filter: { q: 'login' },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
         });
      });
      await waitFor(() =>
         expect(toastMocks.success).toHaveBeenCalledWith('Search saved as a view')
      );
   });

   it('sem resultados mostra a mensagem vazia', async () => {
      useIssuesStore.setState({ issues: [] });
      apiMocks.search.mockResolvedValue(result([]));
      render(<SearchIssues />);
      await waitFor(() => expect(screen.getByText('No results found for "login"')).toBeTruthy());
   });
});
