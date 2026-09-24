// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Cycle } from '@/data/cycles';
import { CycleActions } from '@/components/common/cycles/cycle-actions';
import { useWorkspaceStore } from '@/store/workspace-store';

const apiMocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }));

vi.mock('@/lib/client', async () => {
   class ApiError extends Error {
      constructor(
         public readonly status: number,
         message: string
      ) {
         super(message);
      }
   }
   return {
      ApiError,
      api: { cycles: { update: apiMocks.update, remove: apiMocks.remove } },
   };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CYCLE = {
   id: 'c1',
   number: 1,
   name: 'Cycle 1',
   teamId: 'CORE',
   status: 'upcoming',
   startDate: '2026-01-01',
   endDate: '2026-01-14',
   capacity: 0,
   scope: 0,
   scopeDelta: 0,
   started: 0,
   completed: 0,
} as unknown as Cycle;

beforeEach(() => {
   apiMocks.update.mockReset();
   vi.mocked(toast.error).mockReset();
   useWorkspaceStore.setState({ cycles: [CYCLE] });
});

async function openEdit(cycle: Cycle) {
   const utils = render(<CycleActions cycle={cycle} />);
   fireEvent.pointerDown(screen.getByRole('button'), { button: 0, ctrlKey: false });
   fireEvent.click(await screen.findByText(/Edit/));
   return utils;
}

describe('diálogo de edição de ciclo (#38)', () => {
   it('evento que atualiza o ciclo não apaga o que foi digitado', async () => {
      const { rerender } = await openEdit(CYCLE);
      const input = (await screen.findByLabelText('Name')) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Digitando' } });

      // Evento remoto: o objeto do ciclo muda enquanto o diálogo está aberto.
      rerender(<CycleActions cycle={{ ...CYCLE, scope: 3 } as Cycle} />);

      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Digitando');
   });

   it('Enter no formulário salva e o 409 mostra a mensagem do servidor', async () => {
      const { ApiError } = await import('@/lib/client');
      apiMocks.update.mockRejectedValue(new ApiError(409, 'O time já tem um ciclo em andamento'));
      await openEdit(CYCLE);
      const input = await screen.findByLabelText('Name');

      await act(async () => {
         fireEvent.submit(input.closest('form')!);
      });

      await waitFor(() => expect(apiMocks.update).toHaveBeenCalled());
      await waitFor(() =>
         expect(toast.error).toHaveBeenCalledWith(
            'Could not update the cycle: O time já tem um ciclo em andamento'
         )
      );
   });
});
