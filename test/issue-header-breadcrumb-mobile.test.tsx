// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HeaderNav from '@/components/layout/headers/issue/header-nav';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { Issue } from '@/data/issues';
import type { IssueDetail } from '@/data/issue-details';
import type { Cycle } from '@/data/cycles';
import type { Team } from '@/data/teams';
import { status } from './helpers/catalog-fixture';
import { priorities } from '@/data/priorities';
import { useCurrentIssueStore } from '@/store/current-issue-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * is#18: o breadcrumb do detalhe mostrava "E › ›" em mobile — o ChevronRight do ciclo
 * ficava visível mesmo com o Link do ciclo escondido (`hidden sm:flex`), sobrando um
 * "›" órfão. Chevron e link agora escondem juntos.
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

vi.mock('@/lib/client', () => ({ api: { issues: { update: vi.fn() } } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', issueId: 'CORE-2' }),
   usePathname: () => '/nimbloo/issue/CORE-2',
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

const cycle: Cycle = {
   id: 'cycle-1',
   number: 4,
   name: 'Cycle 4',
   teamId: 'CORE',
   status: 'current',
   startDate: '2026-09-01',
   endDate: '2026-09-14',
   capacity: 0,
   scope: 0,
   scopeDelta: 0,
   started: 0,
   completed: 0,
};

const issue: Issue = {
   id: 'i1',
   identifier: 'CORE-2',
   teamId: 'CORE',
   title: 'Issue com ciclo',
   description: '',
   status: status[0],
   assignee: null,
   assignees: [],
   priority: priorities[0],
   labels: [],
   createdAt: '2026-09-01T00:00:00Z',
   cycleId: 'cycle-1',
   rank: 'a1',
};

const detail: IssueDetail = {
   identifier: 'CORE-2',
   description: [],
   activity: [],
   parent: null,
   subIssues: [],
};

describe('HeaderNav — breadcrumb do ciclo some junto com o chevron (is#18)', () => {
   beforeEach(() => {
      useWorkspaceStore.setState({ teams: [team], cycles: [cycle] });
      useIssuesStore.setState({ issues: [] });
      useCurrentIssueStore.getState().clear();
   });

   it('chevron e link do ciclo ficam no mesmo wrapper "hidden sm:flex"', () => {
      act(() => useCurrentIssueStore.getState().setCurrent(issue, detail));
      const { container } = render(
         <SidebarProvider>
            <HeaderNav />
         </SidebarProvider>
      );

      const cycleLink = Array.from(container.querySelectorAll('a')).find((a) =>
         a.textContent?.includes('Cycle 4')
      );
      expect(cycleLink).toBeTruthy();
      const wrapper = cycleLink!.parentElement as HTMLElement;
      expect(wrapper.classList.contains('hidden')).toBe(true);
      expect(wrapper.classList.contains('sm:flex')).toBe(true);
      // O chevron do ciclo é irmão do link, dentro do MESMO wrapper escondido —
      // não sobra órfão visível fora dele.
      expect(wrapper.querySelectorAll('svg').length).toBe(2);
   });
});
