// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Cycle } from '@/data/cycles';
import Cycles from '@/components/common/cycles/cycles';
import { CycleActions } from '@/components/common/cycles/cycle-actions';
import { useWorkspaceStore } from '@/store/workspace-store';

const apiMocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }));

vi.mock('@/lib/client', () => {
   class ApiError extends Error {
      constructor(
         public readonly status: number,
         message: string
      ) {
         super(message);
      }
   }
   return { ApiError, api: { cycles: { update: apiMocks.update, remove: apiMocks.remove } } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', teamId: 'CORE' }),
   usePathname: () => '/nimbloo/team/CORE/cycles',
   useRouter: () => ({ push: vi.fn() }),
}));

const cycle = (over: Partial<Cycle> & { id: string }): Cycle =>
   ({
      number: 1,
      name: over.id,
      teamId: 'CORE',
      status: 'upcoming',
      startDate: '2026-01-01',
      endDate: '2026-01-14',
      capacity: 0,
      scope: 4,
      scopeDelta: 0,
      started: 1,
      completed: 2,
      ...over,
   }) as Cycle;

beforeEach(() => {
   vi.clearAllMocks();
   useWorkspaceStore.setState({
      loaded: true,
      cycles: [
         cycle({ id: 'c-done', name: 'Cycle 1', status: 'completed', successRate: 60 }),
         cycle({
            id: 'c-planned',
            name: 'Cycle 9',
            status: 'planned',
            startDate: '2026-03-01',
            endDate: '2026-03-14',
         }),
      ],
   });
});

describe('ciclos planned e completed acessíveis (pl#4)', () => {
   it('o ciclo planned aparece com o rótulo e abre os detalhes na lista', async () => {
      render(<Cycles />);
      expect(screen.getByText('Planned')).toBeTruthy();
      const row = screen.getByRole('button', { name: 'Open Cycle 9' });
      expect(row.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(row);
      expect(
         screen.getByRole('button', { name: 'Open Cycle 9' }).getAttribute('aria-expanded')
      ).toBe('true');
   });

   it('o ciclo completed também abre', () => {
      render(<Cycles />);
      fireEvent.click(screen.getByRole('button', { name: 'Open Cycle 1' }));
      expect(
         screen.getByRole('button', { name: 'Open Cycle 1' }).getAttribute('aria-expanded')
      ).toBe('true');
   });
});

async function openEdit(c: Cycle) {
   render(<CycleActions cycle={c} />);
   fireEvent.pointerDown(screen.getByRole('button'), { button: 0, ctrlKey: false });
   fireEvent.click(await screen.findByText(/Edit/));
}

describe('capacidade do ciclo (pl#18)', () => {
   it('recusa valor inválido com mensagem clara, sem chamar a API', async () => {
      await openEdit(cycle({ id: 'c1', name: 'Cycle 1' }));
      fireEvent.change(await screen.findByLabelText('Capacity (%)'), { target: { value: '-1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(String(vi.mocked(toast.error).mock.calls[0][0])).toMatch(/whole number|0 or more/i);
      expect(apiMocks.update).not.toHaveBeenCalled();
   });

   it('campo vazio não vira 0: a capacidade fica como está', async () => {
      apiMocks.update.mockResolvedValue(cycle({ id: 'c1', capacity: 40 }));
      await openEdit(cycle({ id: 'c1', name: 'Cycle 1', capacity: 40 }));
      fireEvent.change(await screen.findByLabelText('Capacity (%)'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalledTimes(1));
      expect(apiMocks.update.mock.calls[0][1]).not.toHaveProperty('capacity');
   });

   it('vários envios seguidos viram um PATCH só', async () => {
      apiMocks.update.mockReturnValue(new Promise(() => {}));
      await openEdit(cycle({ id: 'c1', name: 'Cycle 1' }));
      const submit = await screen.findByRole('button', { name: 'Save changes' });
      fireEvent.click(submit);
      fireEvent.click(submit);
      fireEvent.click(submit);
      expect(apiMocks.update).toHaveBeenCalledTimes(1);
   });
});
