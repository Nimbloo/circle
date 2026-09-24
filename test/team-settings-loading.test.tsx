// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Deep-link frio para as settings de um time: enquanto o workspace hidrata, a tela
 * carrega — "Team not found" só como estado FINAL (mesma regra do overview/membros).
 */
Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/settings/teams/ENG',
   useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/client', () => ({
   api: {
      teamSlas: { list: vi.fn(() => new Promise(() => {})) },
      automations: { list: vi.fn(() => new Promise(() => {})) },
   },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: TeamSettings } = await import('@/components/common/settings/team-settings');
const { default: TeamWorkflowsSettings } = await import(
   '@/components/common/settings/team-workflows-settings'
);
const { SidebarProvider } = await import('@/components/ui/sidebar');

const SCREENS = [
   ['team settings', () => <TeamSettings teamId="ENG" />],
   ['workflows', () => <TeamWorkflowsSettings teamId="ENG" />],
] as const;

function mount(Screen: () => React.ReactElement) {
   return render(
      <SidebarProvider>
         <Screen />
      </SidebarProvider>
   );
}

beforeEach(() => {
   useWorkspaceStore.setState({ loaded: false, teams: [], me: null, cycles: [], users: [] });
});

describe('settings do time durante a hidratação', () => {
   it.each(SCREENS)('%s: hidratando mostra loading, não "Team not found"', (_, Screen) => {
      mount(Screen);
      expect(screen.queryByRole('heading', { name: 'Team not found' })).toBeNull();
      expect(screen.getByRole('status')).toBeTruthy();
   });

   it.each(SCREENS)('%s: carregado sem o time mostra "Team not found"', (_, Screen) => {
      useWorkspaceStore.setState({ loaded: true });
      mount(Screen);
      expect(screen.getByRole('heading', { name: 'Team not found' })).toBeTruthy();
   });
});
