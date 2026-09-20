// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { Team } from '@/data/teams';

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', teamId: 'CORE' }),
   usePathname: () => '/nimbloo/teams',
   useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('nuqs', () => ({
   parseAsArrayOf: () => ({ withDefault: () => ({}) }),
   parseAsString: {},
   useQueryStates: () => [{ membership: [], identifier: [] }, () => {}],
}));
vi.mock('@/lib/client', () => ({ api: { teams: { update: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: Teams } = await import('@/components/common/teams/teams');
const { default: TeamSettings } = await import('@/components/common/settings/team-settings');
const { SidebarProvider } = await import('@/components/ui/sidebar');

function team(id: string, name: string, parentId: string | null): Team {
   return {
      id,
      name,
      icon: '📁',
      joined: true,
      color: '#000',
      estimateScale: 'fibonacci',
      cycleCooldownDays: 0,
      autoCloseParent: false,
      autoCloseChildren: false,
      parentId,
      members: [],
   };
}

beforeEach(() => {
   useWorkspaceStore.setState({
      loaded: true,
      me: { id: 'me', admin: true } as never,
      teams: [
         team('CORE', 'Core', null),
         team('WEB', 'Web', 'CORE'),
         team('DESIGN', 'Design', null),
      ],
      projects: [],
      cycles: [],
   });
});

describe('/teams com hierarquia de sub-times', () => {
   it('o sub-time aparece aninhado no pai, e não como linha de topo', () => {
      render(
         <SidebarProvider>
            <Teams />
         </SidebarProvider>
      );
      const parentRow = screen.getByRole('group', { name: 'Core' });
      expect(within(parentRow).getByRole('link', { name: /Web/ })).toBeTruthy();
      // Design é de topo e não está dentro do Core.
      expect(within(parentRow).queryByRole('link', { name: /Design/ })).toBeNull();
   });

   it('recolher o pai esconde o sub-time', () => {
      render(
         <SidebarProvider>
            <Teams />
         </SidebarProvider>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Collapse Core' }));
      expect(screen.queryByRole('link', { name: /Web/ })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Expand Core' }));
      expect(screen.getByRole('link', { name: /Web/ })).toBeTruthy();
   });
});

describe('settings do time: hierarquia', () => {
   it('a seção Team hierarchy lista os sub-times do time', () => {
      render(
         <SidebarProvider>
            <TeamSettings teamId="CORE" />
         </SidebarProvider>
      );
      const section = screen.getByRole('group', { name: 'Team hierarchy' });
      expect(within(section).getByText('Web')).toBeTruthy();
   });

   it('o time sem sub-times explica que não há nenhum', () => {
      render(
         <SidebarProvider>
            <TeamSettings teamId="DESIGN" />
         </SidebarProvider>
      );
      const section = screen.getByRole('group', { name: 'Team hierarchy' });
      expect(within(section).getByText(/No sub-teams/)).toBeTruthy();
   });
});
