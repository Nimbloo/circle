// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchIssues } from '@/components/common/issues/search-issues';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useSearchStore } from '@/store/search-store';

const apiMocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: { issues: { list: apiMocks.list, get: apiMocks.get } },
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));

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

describe('SearchIssues — resultados vivos do issues-store', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      useSearchStore.setState({ isSearchOpen: true, searchQuery: 'login' });
   });

   it('a linha reflete uma mutação do store (não é uma cópia local do fetch)', async () => {
      const a = makeIssue({ id: 'a', title: 'Login quebrado' });
      useIssuesStore.setState({ issues: [a] });
      apiMocks.list.mockResolvedValue([dtoOf(a)]);

      render(<SearchIssues />);
      await screen.findByText('Results (1)');
      expect(screen.getByText('Login quebrado')).toBeTruthy();
      expect(screen.getByLabelText('Change priority: No priority')).toBeTruthy();

      const high = priorities.find((p) => p.id === 'high')!;
      act(() => {
         useIssuesStore.setState((s) => ({
            issues: s.issues.map((i) => (i.id === 'a' ? { ...i, priority: high } : i)),
         }));
      });
      expect(screen.getByLabelText('Change priority: High')).toBeTruthy();
      expect(apiMocks.list).toHaveBeenCalledWith({ q: 'login' });
   });

   it('resultado ausente do store entra por applyRemote e aparece', async () => {
      useIssuesStore.setState({ issues: [] });
      const b = makeIssue({ id: 'b', title: 'Login por SSO' });
      apiMocks.list.mockResolvedValue([dtoOf(b)]);
      apiMocks.get.mockResolvedValue(dtoOf(b));

      render(<SearchIssues />);
      await screen.findByText('Login por SSO');
      expect(apiMocks.get).toHaveBeenCalledWith('b');
      expect(useIssuesStore.getState().getIssueById('b')).toBeDefined();
   });

   it('sem resultados mostra a mensagem vazia', async () => {
      useIssuesStore.setState({ issues: [] });
      apiMocks.list.mockResolvedValue([]);
      render(<SearchIssues />);
      await waitFor(() => expect(screen.getByText('No results found for "login"')).toBeTruthy());
   });
});
