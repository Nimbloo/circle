// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HeaderNav from '@/components/layout/headers/issue/header-nav';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { Issue } from '@/data/issues';
import type { IssueDetail } from '@/data/issue-details';
import type { Team } from '@/data/teams';
import { status } from '@/data/status';
import { priorities } from '@/data/priorities';
import { useCurrentIssueStore } from '@/store/current-issue-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

// O SidebarProvider (LocationBar) consulta o breakpoint mobile via matchMedia (jsdom não tem).
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

vi.mock('@/lib/client', () => ({
   api: { issues: { update: vi.fn() } },
}));

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
   members: [],
   projects: [],
};

const child: Issue = {
   id: 'child',
   identifier: 'CORE-2',
   teamId: 'CORE',
   title: 'Filha aberta',
   description: '',
   status: status[0],
   assignee: null,
   priority: priorities[0],
   labels: [],
   createdAt: '2026-09-01T00:00:00Z',
   cycleId: '',
   rank: 'a1',
   parentId: 'parent',
   parentIdentifier: 'CORE-1',
};

const detail: IssueDetail = {
   identifier: 'CORE-2',
   description: [],
   activity: [],
   parent: { id: 'parent', identifier: 'CORE-1', title: 'Pai' },
   subIssues: [],
};

describe('HeaderNav — breadcrumb com o pai (#95)', () => {
   beforeEach(() => {
      useWorkspaceStore.setState({ teams: [team] });
      useIssuesStore.setState({ issues: [] }); // deep-link frio: nada no store
      useCurrentIssueStore.getState().clear();
   });

   it('mostra Team › PARENT › CHILD lendo do current-issue-store (não do issues-store)', () => {
      act(() => useCurrentIssueStore.getState().setCurrent(child, detail));
      render(
         <SidebarProvider>
            <HeaderNav />
         </SidebarProvider>
      );

      const parentLink = screen.getByTestId('breadcrumb-parent');
      expect(parentLink.textContent).toContain('CORE-1');
      expect(parentLink.getAttribute('href')).toBe('/nimbloo/issue/CORE-1');
      expect(screen.getByText('CORE-2')).toBeTruthy();
      expect(screen.getByText('Filha aberta')).toBeTruthy();
      // O menu "..." está lá (com "Convert to sub-issue of…" dentro, ao abrir).
      expect(screen.getByRole('button', { name: 'Issue actions' })).toBeTruthy();
   });

   it('sem pai, o breadcrumb não ganha o segmento do pai', () => {
      act(() =>
         useCurrentIssueStore
            .getState()
            .setCurrent(
               { ...child, parentId: null, parentIdentifier: null },
               { ...detail, parent: null }
            )
      );
      render(
         <SidebarProvider>
            <HeaderNav />
         </SidebarProvider>
      );
      expect(screen.queryByTestId('breadcrumb-parent')).toBeNull();
      expect(screen.getByText('CORE-2')).toBeTruthy();
   });
});
