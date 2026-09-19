// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Initiative } from '@/data/initiatives';
import { health } from '@/data/projects';
import { priorities } from '@/data/priorities';
import type { InitiativeDto } from '@/lib/api/initiatives';
import { InitiativePropertiesPanel } from '@/components/common/initiatives/initiative-properties-panel';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useCatalogStore } from '@/store/catalog-store';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/initiative/init-1',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const update = vi.fn();
vi.mock('@/lib/client', () => ({
   api: {
      initiatives: {
         update: (...args: unknown[]) => update(...args),
         get: vi.fn(),
         activity: vi.fn(async () => []),
      },
   },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const INIT: Initiative = {
   id: 'init-1',
   name: 'North Star',
   icon: '🎯',
   status: 'planned',
   priority: priorities[0],
   health: health[0],
   labels: [],
   projectIds: [],
   parentId: null,
   childIds: [],
   rollupProjectCount: 0,
   rollupCompletedProjectCount: 0,
   createdAt: '2026-01-01T00:00:00.000Z',
};

function dto(over: Partial<InitiativeDto>): InitiativeDto {
   return {
      id: 'init-1',
      slug: 'north-star',
      name: 'North Star',
      description: null,
      icon: '🎯',
      iconColor: null,
      status: 'planned',
      priority: { id: priorities[0].id, name: priorities[0].name } as InitiativeDto['priority'],
      health: { id: health[0].id, name: health[0].name } as InitiativeDto['health'],
      owner: null,
      target: null,
      startDate: null,
      targetDate: null,
      labels: [],
      projectIds: [],
      projectCount: 0,
      completedProjectCount: 0,
      parentId: null,
      childIds: [],
      rollupProjectCount: 0,
      rollupCompletedProjectCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...over,
   };
}

const current = () => useWorkspaceStore.getState().initiatives.find((i) => i.id === 'init-1')!;

beforeEach(() => {
   update.mockReset();
   useWorkspaceStore.setState({ initiatives: [INIT], projects: [], users: [], loaded: true });
   useCatalogStore.setState({
      labels: [
         { id: 'growth', name: 'Growth', color: 'purple' },
         { id: 'platform', name: 'Platform', color: 'blue' },
      ],
   } as never);
});

describe('painel de propriedades da initiative (#5, #46)', () => {
   it('Status, Priority, Owner e Parent abrem o popover (trigger recebe props/ref)', async () => {
      render(<InitiativePropertiesPanel initiative={INIT} />);

      fireEvent.click(screen.getByRole('button', { name: /Planned/ }));
      expect(await screen.findByRole('button', { name: /Active/ })).toBeTruthy();

      for (const name of [new RegExp(priorities[0].name), /Add owner/, /No parent/]) {
         const trigger = screen.getAllByRole('button', { name })[0];
         expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
      }
   });

   it('troca de status é otimista e confirma com o DTO do servidor', async () => {
      let resolve!: (d: InitiativeDto) => void;
      update.mockImplementation(() => new Promise<InitiativeDto>((r) => (resolve = r)));
      render(<InitiativePropertiesPanel initiative={INIT} />);

      fireEvent.click(screen.getByRole('button', { name: /Planned/ }));
      fireEvent.click(await screen.findByRole('button', { name: /Active/ }));

      expect(current().status).toBe('active');
      expect(update).toHaveBeenCalledWith('init-1', { status: 'active' });
      await act(async () => resolve(dto({ status: 'active' })));
      expect(current().status).toBe('active');
   });

   it('falha reverte só o campo otimista', async () => {
      update.mockRejectedValue(new Error('boom'));
      render(<InitiativePropertiesPanel initiative={INIT} />);

      fireEvent.click(screen.getByRole('button', { name: /Planned/ }));
      fireEvent.click(await screen.findByRole('button', { name: /Active/ }));

      await waitFor(() => expect(current().status).toBe('planned'));
   });

   it('cliques rápidos em labels são serializados e acumulam a seleção', async () => {
      const pending: ((d: InitiativeDto) => void)[] = [];
      update.mockImplementation(() => new Promise<InitiativeDto>((r) => pending.push(r)));
      const { rerender } = render(<InitiativePropertiesPanel initiative={INIT} />);

      fireEvent.click(screen.getByRole('button', { name: 'Change labels' }));
      fireEvent.click(await screen.findByText('Growth'));
      rerender(<InitiativePropertiesPanel initiative={current()} />);
      fireEvent.click(screen.getByText('Platform'));

      // O 2º PATCH só sai depois do 1º responder (sem corrida no servidor).
      expect(update).toHaveBeenCalledTimes(1);
      expect(current().labels.map((l) => l.id)).toEqual(['growth', 'platform']);

      await act(async () =>
         pending[0](dto({ labels: [{ id: 'growth', name: 'Growth', color: 'purple' }] as never }))
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
      expect(update.mock.calls[1][1]).toEqual({ labelIds: ['growth', 'platform'] });
      // A resposta intermediária não apaga a seleção otimista ainda pendente.
      expect(current().labels.map((l) => l.id)).toEqual(['growth', 'platform']);
   });

   it('re-selecionar o valor atual não dispara PATCH (Pl#22)', async () => {
      // id próprio: a fila de PATCH do teste anterior segue pendente para init-1.
      const other = { ...INIT, id: 'init-2' };
      useWorkspaceStore.setState({ initiatives: [other] });
      update.mockResolvedValue(dto({ id: 'init-2' }));
      render(<InitiativePropertiesPanel initiative={other} />);

      fireEvent.click(screen.getByRole('button', { name: /Planned/ }));
      const options = await screen.findAllByRole('button', { name: /Planned/ });
      fireEvent.click(options[options.length - 1]);

      const priorityTrigger = screen.getAllByRole('button', {
         name: new RegExp(priorities[0].name),
      })[0];
      fireEvent.click(priorityTrigger);
      const priorityOptions = await screen.findAllByRole('button', {
         name: new RegExp(priorities[0].name),
      });
      fireEvent.click(priorityOptions[priorityOptions.length - 1]);

      fireEvent.click(screen.getAllByRole('button', { name: /No parent/ })[0]);
      fireEvent.click(await screen.findByRole('option', { name: 'No parent' }));

      await act(async () => {});
      expect(update).not.toHaveBeenCalled();
   });
});
