// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberActions } from '@/components/common/members/member-actions';
import { activeUsers, type User } from '@/data/users';
import { useWorkspaceStore } from '@/store/workspace-store';
import { api } from '@/lib/client';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/members',
}));

vi.mock('@/lib/client', () => ({
   api: { members: { setDeactivated: vi.fn() } },
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (m: string) => toastSuccess(m), error: vi.fn() } }));

function user(id: string, name: string, deactivatedAt: string | null = null): User {
   return {
      id,
      name,
      email: `${id}@nimbloo.ai`,
      slug: id,
      avatarUrl: '',
      status: 'offline',
      role: 'Member',
      joinedDate: '2026-01-01',
      teamIds: ['CORE'],
      timezone: 'UTC',
      deactivatedAt,
   };
}

const LIA = user('lia', 'Lia');

/** Radix abre o menu no `pointerdown`, não no `click` (jsdom não sintetiza o par). */
function openMenu(name: string) {
   fireEvent.pointerDown(screen.getByRole('button', { name }), { button: 0, ctrlKey: false });
}

describe('Deactivate na lista de membros (#100)', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      useWorkspaceStore.setState({
         users: [LIA],
         me: { id: 'ana', admin: true } as never,
      });
   });

   it('activeUsers tira os desativados dos seletores', () => {
      const list = [LIA, user('bob', 'Bob', '2026-02-01T00:00:00.000Z')];
      expect(activeUsers(list).map((u) => u.id)).toEqual(['lia']);
   });

   it('não mostra o menu para não-admin', () => {
      useWorkspaceStore.setState({ me: { id: 'ana', admin: false } as never });
      const { container } = render(<MemberActions user={LIA} />);
      expect(container.firstChild).toBeNull();
   });

   it('pede confirmação inline antes de desativar e só então chama a API', async () => {
      vi.mocked(api.members.setDeactivated).mockResolvedValue({
         ...LIA,
         teamIds: [],
         teamCount: 0,
         presence: 'offline',
         joinedAt: '2026-01-01',
         avatarUrl: null,
         timezone: null,
         deactivatedAt: '2026-02-01T00:00:00.000Z',
      } as never);

      render(<MemberActions user={LIA} />);
      openMenu('Actions for Lia');

      // 1º clique só abre a confirmação — nada chamado ainda.
      fireEvent.click(await screen.findByText('Deactivate'));
      expect(api.members.setDeactivated).not.toHaveBeenCalled();
      expect(screen.getByText(/bloqueia o login/i)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      await waitFor(() => expect(api.members.setDeactivated).toHaveBeenCalledWith('lia', true));
      // Toast de sucesso só depois da API confirmar.
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Membro desativado'));
   });

   it('membro desativado oferece Reactivate direto (sem confirmação)', async () => {
      const off = user('lia', 'Lia', '2026-02-01T00:00:00.000Z');
      vi.mocked(api.members.setDeactivated).mockResolvedValue({
         ...off,
         teamIds: [],
         teamCount: 0,
         presence: 'offline',
         joinedAt: '2026-01-01',
         avatarUrl: null,
         timezone: null,
         deactivatedAt: null,
      } as never);

      render(<MemberActions user={off} />);
      openMenu('Actions for Lia');
      fireEvent.click(await screen.findByText('Reactivate'));
      await waitFor(() => expect(api.members.setDeactivated).toHaveBeenCalledWith('lia', false));
   });
});
