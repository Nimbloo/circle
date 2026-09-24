// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';

/** Sidebar de settings: convidado não cria time nem pede entrada — o atalho não aparece. */
Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/settings/preferences',
}));

const { NavTeamsSettings } = await import('@/components/layout/sidebar/nav-teams-settings');
const { SidebarProvider } = await import('@/components/ui/sidebar');

const mount = () =>
   render(
      <SidebarProvider>
         <NavTeamsSettings />
      </SidebarProvider>
   );

beforeEach(() => {
   useWorkspaceStore.setState({
      teams: [{ id: 'ENG', name: 'Engineering', icon: '📁', joined: true }] as never,
   });
});

describe('NavTeamsSettings', () => {
   it('convidado não vê "Join or create a team"', () => {
      useWorkspaceStore.setState({ me: { id: 'g', role: 'Guest' } as never });
      mount();
      expect(screen.getByRole('link', { name: /Engineering/ })).toBeTruthy();
      expect(screen.queryByRole('link', { name: /Join or create a team/ })).toBeNull();
   });

   it('membro vê "Join or create a team"', () => {
      useWorkspaceStore.setState({ me: { id: 'm', role: 'Member' } as never });
      mount();
      expect(screen.getByRole('link', { name: /Join or create a team/ })).toBeTruthy();
   });
});
