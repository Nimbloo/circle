// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import type { User } from '@/data/users';
import { priorities } from '@/data/priorities';
import { status } from './helpers/catalog-fixture';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const apiMocks = vi.hoisted(() => ({
   issues: { list: vi.fn(async () => []) },
   me: { subscriptions: vi.fn(async () => ({ issueIds: [] })), activity: vi.fn(async () => []) },
}));
const shown = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock('@/lib/client', () => ({ api: apiMocks }));
vi.mock('nuqs', () => ({
   parseAsStringLiteral: () => ({ withDefault: () => ({}) }),
   useQueryState: () => ['assigned', () => {}],
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
   GroupedIssuesView: ({ issues }: { issues: Issue[] }) => {
      shown.ids = issues.map((i) => i.id);
      return null;
   },
}));

const ME: User = {
   id: 'u-me',
   name: 'Eu',
   email: 'eu@nimbloo.ai',
   avatarUrl: '',
   status: 'online',
   role: 'Member',
   joinedDate: '2026-01-01',
   teamIds: ['ENG'],
   timezone: 'UTC',
};

const make = (id: string, assignees: User[]): Issue => ({
   id,
   identifier: `ENG-${id}`,
   title: id,
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: assignees[0] ?? null,
   assignees,
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: id,
   teamId: 'ENG',
});

describe('#29 My issues > Assigned derivado do store', () => {
   beforeEach(() => {
      vi.clearAllMocks();
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
      useIssuesStore.setState({
         issues: [make('a', [ME]), make('b', [])],
         loading: false,
         loaded: true,
         error: false,
      });
   });

   it('não busca no servidor e acompanha mudança de responsável na hora', async () => {
      const { default: MyIssues } = await import('@/components/common/my-issues/my-issues');
      render(<MyIssues />);
      expect(shown.ids).toEqual(['a']);
      act(() => {
         useIssuesStore.setState((s) => ({
            issues: s.issues.map((i) => (i.id === 'a' ? make('a', []) : make('b', [ME]))),
         }));
      });
      expect(shown.ids).toEqual(['b']);
      expect(apiMocks.issues.list).not.toHaveBeenCalled();
   });
});
