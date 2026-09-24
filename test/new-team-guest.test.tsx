// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * "Join or create a team": convidado não cria time (o servidor responde 403). O botão
 * "New team" da lista já some para ele; a página de settings oferecia o formulário.
 */
Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});
const list = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({ api: { teams: { list, create: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: NewTeam } = await import('@/components/common/settings/new-team');
const { SidebarProvider } = await import('@/components/ui/sidebar');

function mount() {
   return render(
      <SidebarProvider>
         <NewTeam />
      </SidebarProvider>
   );
}

beforeEach(() => {
   list.mockResolvedValue([]);
});

describe('NewTeam (settings/teams/new)', () => {
   it('convidado não vê o formulário de criar time', async () => {
      useWorkspaceStore.setState({ me: { id: 'g', role: 'Guest', admin: false } as never });
      mount();
      await waitFor(() => expect(list).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: 'Criar time' })).toBeNull();
      // Sem o formulário, "crie o primeiro acima" apontaria para o nada.
      expect(screen.queryByText(/crie o primeiro acima/)).toBeNull();
   });

   it('membro vê o formulário de criar time', async () => {
      useWorkspaceStore.setState({ me: { id: 'm', role: 'Member', admin: false } as never });
      mount();
      await waitFor(() => expect(list).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'Criar time' })).toBeTruthy();
   });
});
