// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}
Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

const apiMocks = vi.hoisted(() => ({
   emojisList: vi.fn(),
   emojisRemove: vi.fn(),
   invitesList: vi.fn(),
   invitesCreate: vi.fn(),
   invitesRevoke: vi.fn(),
   removeMember: vi.fn(),
   joinRequests: vi.fn(),
}));
vi.mock('@/lib/client', async (orig) => ({
   ...(await orig<typeof import('@/lib/client')>()),
   api: {
      emojis: { list: apiMocks.emojisList, remove: apiMocks.emojisRemove },
      invites: {
         list: apiMocks.invitesList,
         create: apiMocks.invitesCreate,
         revoke: apiMocks.invitesRevoke,
      },
      teams: { removeMember: apiMocks.removeMember, joinRequests: apiMocks.joinRequests },
   },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', teamId: 'CORE' }),
   usePathname: () => '/nimbloo/team/CORE/members',
   useRouter: () => ({ push: vi.fn() }),
}));

const { default: EmojisSettings } = await import('@/components/common/settings/emojis-settings');
const { InvitePanel } = await import('@/components/common/members/invite-panel');
const { default: TeamMembers } = await import('@/components/common/teams/team-members');
const { SidebarProvider } = await import('@/components/ui/sidebar');

const ana = {
   id: 'u1',
   name: 'Ana Souza',
   slug: 'ana',
   email: 'ana@nimbloo.ai',
   role: 'Member',
   avatarUrl: '',
};

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.invitesList.mockResolvedValue([]);
   apiMocks.joinRequests.mockResolvedValue([]);
   useWorkspaceStore.setState({
      me: { id: 'me', admin: true } as never,
      loaded: true,
      teams: [{ id: 'CORE', name: 'Core', members: [ana] }] as never,
   });
});

describe('ações destrutivas de admin pedem confirmação (ad#13)', () => {
   it('remover emoji abre confirmação; só remove ao confirmar', async () => {
      apiMocks.emojisList.mockResolvedValue([{ id: 'e1', shortcode: 'deploy', url: '/e.png' }]);
      apiMocks.emojisRemove.mockResolvedValue({ deleted: true });
      render(
         <SidebarProvider>
            <EmojisSettings />
         </SidebarProvider>
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Remover :deploy:' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(apiMocks.emojisRemove).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
      await waitFor(() => expect(apiMocks.emojisRemove).toHaveBeenCalledWith('e1'));
   });

   it('remover membro do time pede confirmação', async () => {
      apiMocks.removeMember.mockResolvedValue([]);
      render(<TeamMembers />);
      fireEvent.click(screen.getByRole('button', { name: 'Remove Ana Souza' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(apiMocks.removeMember).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(apiMocks.removeMember).toHaveBeenCalledWith('CORE', 'u1'));
   });

   it('a linha do membro mostra o usuário (slug), não o nome repetido', () => {
      render(<TeamMembers />);
      expect(screen.getAllByText('Ana Souza')).toHaveLength(1);
      expect(screen.getByText('ana')).toBeTruthy();
   });

   it('revogar convite pede confirmação na própria linha', async () => {
      apiMocks.invitesList.mockResolvedValue([
         { id: 'i1', email: 'bia@nimbloo.ai', role: 'Member', acceptedAt: null, expired: false },
      ]);
      apiMocks.invitesRevoke.mockResolvedValue({ revoked: true });
      const user = userEvent.setup();
      render(<InvitePanel />);
      await user.click(screen.getByRole('button', { name: 'Invite members' }));
      await user.click(
         await screen.findByRole('button', { name: 'Revoke invite for bia@nimbloo.ai' })
      );
      expect(apiMocks.invitesRevoke).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Confirm revoke' }));
      await waitFor(() => expect(apiMocks.invitesRevoke).toHaveBeenCalledWith('i1'));
   });
});

describe('convites seguidos (ad#9)', () => {
   it('o e-mail digitado enquanto o 1º convite salva não é apagado', async () => {
      let resolveFirst: (v: unknown) => void = () => {};
      apiMocks.invitesCreate.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
      Object.defineProperty(navigator, 'clipboard', {
         configurable: true,
         value: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
      const user = userEvent.setup();
      render(<InvitePanel />);
      await user.click(screen.getByRole('button', { name: 'Invite members' }));
      const input = screen.getByPlaceholderText('name@nimbloo.ai') as HTMLInputElement;
      await user.type(input, 'a@nimbloo.ai{Enter}');
      await user.clear(input);
      await user.type(input, 'b@nimbloo.ai');
      await act(async () => {
         resolveFirst({ email: 'a@nimbloo.ai', url: 'https://c/i/a' });
      });
      expect(input.value).toBe('b@nimbloo.ai');
   });
});
