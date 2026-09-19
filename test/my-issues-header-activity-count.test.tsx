// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from './helpers/catalog-fixture';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

// LocationBar (SidebarTrigger) consulta o breakpoint mobile via matchMedia (jsdom não tem).
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

/**
 * is#17: My issues › Activity mostrava a contagem de "Subscribed" no header, porque o
 * contador não recebia os `activeIds` (vindos de /me/activity) usados pelo corpo da tela.
 */

const apiMocks = vi.hoisted(() => ({
   activity: vi.fn(async () => [{ issueId: 'a' }, { issueId: 'b' }]),
}));

vi.mock('@/lib/client', () => ({ api: { me: { activity: apiMocks.activity } } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/my-issues',
}));
vi.mock('nuqs', () => ({
   parseAsStringLiteral: () => ({ withDefault: () => ({}) }),
   useQueryState: () => ['activity', () => {}],
}));
vi.mock('@/components/layout/headers/display-options', () => ({ DisplayOptions: () => null }));
vi.mock('@/components/layout/headers/issues/notifications', () => ({ default: () => null }));
vi.mock('@/components/common/issues/issue-filter-trigger', () => ({
   IssueFilterTrigger: () => null,
}));

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

describe('My issues header — contador da aba Activity (is#17)', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      apiMocks.activity.mockResolvedValue([{ issueId: 'a' }, { issueId: 'b' }]);
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
            subscribedIssueIds: ['c'],
            githubLogin: null,
         },
      });
      useIssuesStore.setState({
         issues: [make('a'), make('b'), make('c')],
         loading: false,
         loaded: true,
         error: false,
      });
   });

   it('conta as issues com atividade minha, não as assinadas', async () => {
      const { default: Header } = await import('@/components/layout/headers/my-issues/header');
      render(
         <SidebarProvider>
            <Header />
         </SidebarProvider>
      );
      expect(await screen.findByText('2 issues')).toBeTruthy();
   });
});
