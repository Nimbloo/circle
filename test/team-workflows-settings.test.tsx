// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamWorkflowsSettings from '@/components/common/settings/team-workflows-settings';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { TeamAutomationDto } from '@/lib/api/automations';
import type { TeamSlaDto } from '@/lib/api/slas';
import { useCatalogStore } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { priorities } from '@/data/priorities';
import { status } from './helpers/catalog-fixture';
import { labels } from './helpers/catalog-fixture';

// O Select do Radix usa Pointer Capture, que o jsdom não implementa.
for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, {
      configurable: true,
      value: () => false,
   });
}

// O SidebarProvider consulta o breakpoint mobile via matchMedia (jsdom não tem).
Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
   }),
});

const apiMocks = vi.hoisted(() => ({
   slaList: vi.fn(),
   slaSet: vi.fn(),
   list: vi.fn(),
   create: vi.fn(),
   update: vi.fn(),
   remove: vi.fn(),
}));
vi.mock('@/lib/client', () => ({
   api: {
      teamSlas: { list: apiMocks.slaList, set: apiMocks.slaSet },
      automations: {
         list: apiMocks.list,
         create: apiMocks.create,
         update: apiMocks.update,
         remove: apiMocks.remove,
      },
   },
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

const PR_RULE: TeamAutomationDto = {
   id: 'a1',
   teamId: 'ENG',
   name: 'PR merged → Done',
   trigger: 'pr.merged',
   action: 'set_status',
   config: { statusId: 'done' },
   enabled: true,
   position: 0,
   createdAt: '2026-01-01T00:00:00.000Z',
};

const SLAS: TeamSlaDto[] = [{ teamId: 'ENG', priorityId: 'urgent', hours: 4 }];

function seedStores() {
   useCatalogStore.setState({ statuses: status, priorities, labels });
   useWorkspaceStore.setState({
      teams: [{ id: 'ENG', name: 'Engineering' }] as never,
      users: [],
      me: { admin: true } as never,
   });
}

async function mount() {
   const utils = render(
      <SidebarProvider>
         <TeamWorkflowsSettings teamId="ENG" />
      </SidebarProvider>
   );
   await screen.findByText('PR merged → Done');
   return utils;
}

describe('Team settings → Workflows & automations (#97)', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      apiMocks.slaList.mockResolvedValue(SLAS);
      apiMocks.list.mockResolvedValue([PR_RULE]);
      seedStores();
   });

   it('lista os SLAs por prioridade (vazio = sem SLA) e salva no blur', async () => {
      const user = userEvent.setup();
      apiMocks.slaSet.mockResolvedValue([
         ...SLAS,
         { teamId: 'ENG', priorityId: 'high', hours: 24 },
      ]);
      await mount();

      const urgent = screen.getByLabelText('SLA hours for Urgent') as HTMLInputElement;
      expect(urgent.value).toBe('4');
      const high = screen.getByLabelText('SLA hours for High') as HTMLInputElement;
      expect(high.value).toBe('');

      await user.click(high);
      await user.keyboard('24');
      await user.tab();

      await waitFor(() => expect(apiMocks.slaSet).toHaveBeenCalledWith('ENG', 'high', 24));
      // Toast de sucesso SÓ depois da API.
      await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('SLA atualizado'));
      await waitFor(() => expect(high.value).toBe('24'));
   });

   it('cria uma automação pelo dialog (gatilho + ação + parâmetro)', async () => {
      const user = userEvent.setup();
      const created: TeamAutomationDto = {
         ...PR_RULE,
         id: 'a2',
         name: 'Triage → urgente',
         trigger: 'issue.created_in_triage',
         action: 'set_priority',
         config: { priorityId: 'urgent' },
      };
      apiMocks.create.mockResolvedValue(created);
      await mount();

      await user.click(screen.getByRole('button', { name: /Nova automação/ }));
      await user.type(screen.getByLabelText('Nome'), 'Triage → urgente');
      // Gatilho e ação já vêm no default do dialog (triage + set priority).
      await user.click(screen.getByLabelText('Priority'));
      await user.click(await screen.findByRole('option', { name: 'Urgent' }));
      await user.click(screen.getByRole('button', { name: 'Criar' }));

      await waitFor(() =>
         expect(apiMocks.create).toHaveBeenCalledWith('ENG', {
            name: 'Triage → urgente',
            trigger: 'issue.created_in_triage',
            action: 'set_priority',
            config: { priorityId: 'urgent' },
         })
      );
      expect(await screen.findByText('Triage → urgente')).toBeTruthy();
      expect(toastMocks.success).toHaveBeenCalledWith('Automação criada');
   });

   it('toggle é otimista e volta atrás quando a API falha', async () => {
      const user = userEvent.setup();
      apiMocks.update.mockRejectedValue(new Error('boom'));
      await mount();

      const toggle = screen.getByLabelText('Toggle PR merged → Done');
      expect(toggle.getAttribute('data-state')).toBe('checked');
      await user.click(toggle);

      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('ENG', 'a1', { enabled: false })
      );
      await waitFor(() => expect(toggle.getAttribute('data-state')).toBe('checked'));
      expect(toastMocks.error).toHaveBeenCalledWith('Não foi possível atualizar a automação');
      expect(toastMocks.success).not.toHaveBeenCalled();
   });

   // Auditoria (item 9): o rollback restaurava a lista INTEIRA e desfazia o toggle de outra
   // automação que mudou enquanto o DELETE estava em voo.
   it('exclusão que falha devolve só a automação excluída, sem desfazer o toggle de outra', async () => {
      const user = userEvent.setup();
      const other: TeamAutomationDto = { ...PR_RULE, id: 'a2', name: 'Outra regra', position: 1 };
      apiMocks.list.mockResolvedValue([PR_RULE, other]);
      let rejectRemove!: (e: unknown) => void;
      apiMocks.remove.mockReturnValue(new Promise((_, rej) => (rejectRemove = rej)));
      apiMocks.update.mockResolvedValue({ ...other, enabled: false });
      await mount();

      await user.click(screen.getByRole('button', { name: 'Delete PR merged → Done' }));
      await user.click(await screen.findByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(screen.queryByText('PR merged → Done')).toBeNull());
      await user.click(screen.getByRole('switch', { name: 'Toggle Outra regra' }));
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalled());
      await act(async () => rejectRemove(new Error('500')));

      await screen.findByText('PR merged → Done');
      expect(
         screen.getByRole('switch', { name: 'Toggle Outra regra' }).getAttribute('data-state')
      ).toBe('unchecked');
   });
});
