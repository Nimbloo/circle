// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * "New team": o toast de erro mostrava `e.message` para qualquer status da API — num 500
 * isso é "Internal Server Error" cru. Motivo real só nos 4xx (detail legível); 5xx vira o
 * texto genérico (mesma regra do `errorReason`).
 */
const { ApiError } = await vi.importActual<typeof import('@/lib/client')>('@/lib/client');
const apiMocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/client', async (orig) => ({
   ...(await orig<typeof import('@/lib/client')>()),
   api: { teams: { create: apiMocks.create } },
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

const { NewTeamButton } = await import('@/components/common/teams/new-team-button');

async function submit() {
   render(<NewTeamButton />);
   fireEvent.click(screen.getByRole('button', { name: /New team/ }));
   fireEvent.change(await screen.findByPlaceholderText('Key (ex.: CORE)'), {
      target: { value: 'OPS' },
   });
   fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Ops' } });
   fireEvent.click(screen.getByRole('button', { name: 'Create' }));
}

beforeEach(() => {
   vi.clearAllMocks();
   useWorkspaceStore.setState({ me: { id: 'me', role: 'Admin' } as never });
});

describe('New team — mensagens de erro', () => {
   it('500 não mostra "Internal Server Error" cru', async () => {
      apiMocks.create.mockRejectedValueOnce(new ApiError(500, 'Internal Server Error'));
      await submit();
      await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
      expect(String(toastMocks.error.mock.calls[0][0])).not.toContain('Internal Server Error');
   });

   it('409 mostra o motivo da API', async () => {
      apiMocks.create.mockRejectedValueOnce(new ApiError(409, "Time 'OPS' já existe"));
      await submit();
      await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
      expect(String(toastMocks.error.mock.calls[0][0])).toContain("Time 'OPS' já existe");
   });
});
