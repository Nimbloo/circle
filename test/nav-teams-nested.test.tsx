// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavTeams } from '@/components/layout/sidebar/nav-teams';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { Team } from '@/data/teams';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useSidebarTeamsStore } from '@/store/sidebar-teams-store';

// LocationBar/SidebarProvider consultam o breakpoint via matchMedia (jsdom não tem).
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

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo',
}));

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
      projects: [],
   };
}

describe('sidebar com sub-times (#100)', () => {
   beforeEach(() => {
      useSidebarTeamsStore.setState({ openById: { CORE: true, WEB: true } });
      useWorkspaceStore.setState({
         teams: [team('CORE', 'Core', null), team('WEB', 'Web', 'CORE')],
      });
   });

   it('renderiza o sub-time DENTRO do collapsible do pai', () => {
      render(
         <SidebarProvider>
            <NavTeams />
         </SidebarProvider>
      );

      // Só um item de topo: o pai. O filho aparece aninhado, não como irmão.
      const parentButton = screen.getByRole('button', { name: /^Core/ });
      const parentItem = parentButton.closest('li') as HTMLElement;
      expect(parentItem).toBeTruthy();
      expect(within(parentItem).getByRole('button', { name: /^Web/ })).toBeTruthy();

      // Os links do sub-time apontam pro próprio time, não pro pai.
      const childItem = within(parentItem)
         .getByRole('button', { name: /^Web/ })
         .closest('li') as HTMLElement;
      const home = within(childItem)
         .getAllByRole('link')
         .find((a) => a.textContent === 'Home');
      expect(home?.getAttribute('href')).toBe('/nimbloo/team/WEB/overview');
   });
});
