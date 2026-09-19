// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}

// ApiError REAL do client: é o que `api.*` lança no navegador (#54).
const { ApiError } = await vi.importActual<typeof import('@/lib/client')>('@/lib/client');
const apiMocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
vi.mock('@/lib/client', async (orig) => ({
   ...(await orig<typeof import('@/lib/client')>()),
   api: { invites: apiMocks },
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

const { InvitePanel } = await import('@/components/common/members/invite-panel');

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.list.mockResolvedValue([]);
   useWorkspaceStore.setState({ me: { id: 'me', admin: true } as never });
});

async function invite(email: string) {
   const user = userEvent.setup();
   render(<InvitePanel />);
   await user.click(screen.getByRole('button', { name: 'Invite members' }));
   await user.type(screen.getByPlaceholderText('name@nimbloo.ai'), email);
   await user.click(screen.getByRole('button', { name: 'Invite' }));
}

describe('convite mostra o erro e o link (#54)', () => {
   it('409 do servidor mostra a mensagem real, não a genérica', async () => {
      apiMocks.create.mockRejectedValueOnce(new ApiError(409, 'Já existe convite pendente'));
      await invite('x@nimbloo.ai');
      await waitFor(() =>
         expect(toastMocks.error).toHaveBeenCalledWith('Já existe convite pendente')
      );
   });

   it('clipboard negado não vira "não foi possível criar" e o link fica visível', async () => {
      apiMocks.create.mockResolvedValueOnce({ email: 'x@nimbloo.ai', url: 'https://c/i/tok' });
      Object.defineProperty(navigator, 'clipboard', {
         configurable: true,
         value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      });
      await invite('x@nimbloo.ai');
      await screen.findByText('https://c/i/tok');
      expect(toastMocks.error).not.toHaveBeenCalledWith('Não foi possível criar o convite');
   });
});
