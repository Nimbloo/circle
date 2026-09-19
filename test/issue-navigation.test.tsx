// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HeaderNav from '@/components/layout/headers/issue/header-nav';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { Issue } from '@/data/issues';
import type { Team } from '@/data/teams';
import { status } from '@/data/status';
import { priorities } from '@/data/priorities';
import { useCurrentIssueStore } from '@/store/current-issue-store';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { useIssueNavigationStore } from '@/store/issue-navigation-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

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

const route = vi.hoisted(() => ({ pathname: '/nimbloo/issue/CORE-2', issueId: 'CORE-2' }));
vi.mock('@/lib/client', () => ({ api: { issues: { update: vi.fn() } } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', issueId: route.issueId }),
   usePathname: () => route.pathname,
}));
vi.mock('@/store/filter-store', () => ({
   useFilterStore: () => ({ filters: [], setFilters: () => {}, clearFilters: () => {} }),
}));
vi.mock('react-dnd-html5-backend', async () => {
   const backend = await import('./helpers/dnd-test-backend');
   return { HTML5Backend: backend.createTestBackend, getEmptyImage: () => ({}) };
});
// Virtualizador que renderiza todas as linhas (jsdom não tem layout).
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

const make = (n: number, priorityIndex = 0): Issue => ({
   id: `i${n}`,
   identifier: `CORE-${n}`,
   teamId: 'CORE',
   title: `Issue ${n}`,
   description: '',
   status: status[0],
   assignee: null,
   assignees: [],
   priority: priorities[priorityIndex],
   labels: [],
   createdAt: '2026-09-01T00:00:00Z',
   cycleId: '',
   rank: `a${n}`,
});

const clicked: string[] = [];
beforeEach(() => {
   clicked.length = 0;
   vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
   ) {
      clicked.push(this.getAttribute('href') ?? '');
   });
   useWorkspaceStore.setState({ teams: [team], users: [], projects: [], cycles: [] });
   useCurrentIssueStore.getState().clear();
   useDisplaySettingsStore.setState({ byView: {} });
});
afterEach(() => vi.restoreAllMocks());

describe('#33 anterior/próxima seguem a lista de origem', () => {
   beforeEach(() => {
      route.pathname = '/nimbloo/issue/CORE-2';
      route.issueId = 'CORE-2';
      // Store global em outra ordem e bem maior que a lista de origem.
      useIssuesStore.setState({ issues: [1, 2, 3, 4, 5].map((n) => make(n)) });
      useIssueNavigationStore.getState().setOrder([
         { id: 'i5', identifier: 'CORE-5' },
         { id: 'i2', identifier: 'CORE-2' },
         { id: 'i1', identifier: 'CORE-1' },
      ]);
   });

   it('contador e links vêm da ordem da lista', () => {
      render(
         <SidebarProvider>
            <HeaderNav />
         </SidebarProvider>
      );
      expect(screen.getByText('2 / 3')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Previous issue' }).getAttribute('href')).toBe(
         '/nimbloo/issue/CORE-5'
      );
      expect(screen.getByRole('link', { name: 'Next issue' }).getAttribute('href')).toBe(
         '/nimbloo/issue/CORE-1'
      );
   });

   it('J/K no detalhe navegam', () => {
      render(
         <SidebarProvider>
            <HeaderNav />
         </SidebarProvider>
      );
      fireEvent.keyDown(window, { key: 'j' });
      fireEvent.keyDown(window, { key: 'k' });
      expect(clicked).toEqual(['/nimbloo/issue/CORE-1', '/nimbloo/issue/CORE-5']);
   });
});

describe('lista publica a ordem visível e aceita J/K', () => {
   beforeEach(() => {
      route.pathname = '/nimbloo/team/CORE/all';
      route.issueId = '';
   });

   it('ordem publicada = ordem exibida (prioridade), e J/K + Enter abrem a issue', () => {
      // i1 low, i2 urgent → ordenação padrão (prioridade) exibe i2 antes de i1.
      const low = priorities.findIndex((p) => p.id === 'low');
      const urgent = priorities.findIndex((p) => p.id === 'urgent');
      const issues = [make(1, low), make(2, urgent)];
      useIssuesStore.setState({ issues });
      render(
         <GroupedIssuesView
            issues={issues}
            totalIssues={issues}
            statuses={status}
            isViewTypeGrid={false}
         />
      );
      expect(useIssueNavigationStore.getState().order.map((i) => i.identifier)).toEqual([
         'CORE-2',
         'CORE-1',
      ]);

      act(() => {
         fireEvent.keyDown(window, { key: 'j' });
         fireEvent.keyDown(window, { key: 'j' });
      });
      expect(document.querySelector('[data-active="true"]')?.textContent).toContain('Issue 1');
      act(() => {
         fireEvent.keyDown(window, { key: 'Enter' });
      });
      expect(clicked).toEqual(['/nimbloo/issue/CORE-1']);
   });
});
