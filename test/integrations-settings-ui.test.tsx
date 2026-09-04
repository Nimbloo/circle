// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiTokensSettings from '@/components/common/settings/api-tokens-settings';
import WebhooksSettings from '@/components/common/settings/webhooks-settings';
import ImportExportSettings from '@/components/common/settings/import-export-settings';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { Team } from '@/data/teams';

// O SidebarProvider (usado pelo SettingsShell) consulta matchMedia; jsdom não tem.
Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
   }),
});

/** Todas as telas de Settings vivem dentro do SidebarProvider no app. */
function mount(ui: React.ReactElement) {
   return render(<SidebarProvider>{ui}</SidebarProvider>);
}

const apiMocks = vi.hoisted(() => ({
   tokensList: vi.fn(),
   tokensCreate: vi.fn(),
   tokensRevoke: vi.fn(),
   hooksList: vi.fn(),
   hooksCreate: vi.fn(),
   hooksUpdate: vi.fn(),
   hooksRemove: vi.fn(),
   hooksDeliveries: vi.fn(),
   hooksRedeliver: vi.fn(),
   importPreview: vi.fn(),
   importCommit: vi.fn(),
}));

vi.mock('@/lib/client', () => ({
   api: {
      apiTokens: {
         list: apiMocks.tokensList,
         create: apiMocks.tokensCreate,
         revoke: apiMocks.tokensRevoke,
      },
      webhooks: {
         list: apiMocks.hooksList,
         create: apiMocks.hooksCreate,
         update: apiMocks.hooksUpdate,
         remove: apiMocks.hooksRemove,
         deliveries: apiMocks.hooksDeliveries,
         redeliver: apiMocks.hooksRedeliver,
      },
      importIssues: { preview: apiMocks.importPreview, commit: apiMocks.importCommit },
   },
}));

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.tokensList.mockResolvedValue([]);
   apiMocks.hooksList.mockResolvedValue([]);
   apiMocks.hooksDeliveries.mockResolvedValue([]);
   useWorkspaceStore.setState({
      teams: [{ id: 'CORE', name: 'Core' } as unknown as Team],
   });
});

describe('Settings → API tokens (#101)', () => {
   it('cria o token e mostra o valor em claro uma única vez', async () => {
      const user = userEvent.setup();
      apiMocks.tokensCreate.mockResolvedValue({
         id: 't1',
         name: 'CI',
         prefix: 'circle_abc123',
         scopes: ['read', 'write'],
         createdAt: '2026-09-01T00:00:00.000Z',
         lastUsedAt: null,
         revokedAt: null,
         createdByName: 'Owner',
         token: 'circle_segredo',
      });

      mount(<ApiTokensSettings />);
      await screen.findByText('Nenhum token ainda');

      await user.click(screen.getByRole('button', { name: /Novo token/ }));
      await user.type(screen.getByLabelText('Nome'), 'CI');
      await user.click(screen.getByLabelText('Escopo write'));
      await user.click(screen.getByRole('button', { name: 'Criar token' }));

      await waitFor(() =>
         expect(apiMocks.tokensCreate).toHaveBeenCalledWith('CI', ['read', 'write'])
      );
      // Toast de sucesso só DEPOIS da API confirmar.
      expect(toastMocks.success).toHaveBeenCalledWith('Token criado');
      expect(await screen.findByText('circle_segredo')).toBeTruthy();

      // Fechado o diálogo, a linha mostra só o prefixo — o valor não volta.
      await user.click(screen.getByRole('button', { name: 'Copiar e fechar' }));
      await waitFor(() => expect(screen.queryByText('circle_segredo')).toBeNull());
      expect(screen.getByText('circle_abc123…')).toBeTruthy();
   });

   it('revoga de forma otimista e faz rollback quando a API falha', async () => {
      const user = userEvent.setup();
      apiMocks.tokensList.mockResolvedValue([
         {
            id: 't1',
            name: 'CI',
            prefix: 'circle_abc123',
            scopes: ['read'],
            createdAt: '2026-09-01T00:00:00.000Z',
            lastUsedAt: null,
            revokedAt: null,
            createdByName: 'Owner',
         },
      ]);
      apiMocks.tokensRevoke.mockRejectedValue(new Error('boom'));

      mount(<ApiTokensSettings />);
      await user.click(await screen.findByRole('button', { name: 'Revogar CI' }));
      await user.click(screen.getByRole('button', { name: 'Revogar' }));

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
      // Rollback: o botão de revogar volta.
      expect(screen.getByRole('button', { name: 'Revogar CI' })).toBeTruthy();
   });
});

describe('Settings → Webhooks (#101)', () => {
   it('cria o webhook, revela o segredo e lista as entregas com Redeliver', async () => {
      const user = userEvent.setup();
      apiMocks.hooksCreate.mockResolvedValue({
         id: 'w1',
         url: 'https://exemplo.com/circle',
         events: ['issue.created'],
         enabled: true,
         createdAt: '2026-09-01T00:00:00.000Z',
         createdByName: 'Owner',
         secret: 'segredo-hmac',
      });
      apiMocks.hooksDeliveries.mockResolvedValue([
         {
            id: 'd1',
            webhookId: 'w1',
            event: 'issue.created',
            status: 'failed',
            attempts: 1,
            responseCode: 500,
            lastError: 'HTTP 500',
            nextAttemptAt: '2026-09-01T00:01:00.000Z',
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
         },
      ]);
      apiMocks.hooksRedeliver.mockResolvedValue({
         id: 'd1',
         webhookId: 'w1',
         event: 'issue.created',
         status: 'success',
         attempts: 1,
         responseCode: 200,
         lastError: null,
         nextAttemptAt: null,
         createdAt: '2026-09-01T00:00:00.000Z',
         updatedAt: '2026-09-01T00:02:00.000Z',
      });

      mount(<WebhooksSettings />);
      await screen.findByText('Nenhum webhook ainda');

      await user.click(screen.getByRole('button', { name: /Novo webhook/ }));
      await user.type(screen.getByLabelText('URL de destino'), 'https://exemplo.com/circle');
      await user.click(screen.getByRole('button', { name: 'Criar webhook' }));

      await waitFor(() =>
         expect(apiMocks.hooksCreate).toHaveBeenCalledWith({
            url: 'https://exemplo.com/circle',
            events: ['issue.created'],
         })
      );
      expect(await screen.findByText('segredo-hmac')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Copiar e fechar' }));

      await user.click(screen.getByRole('button', { name: 'Entregas' }));
      expect(await screen.findByText('failed')).toBeTruthy();

      await user.click(screen.getByRole('button', { name: 'Reenviar entrega d1' }));
      await waitFor(() => expect(apiMocks.hooksRedeliver).toHaveBeenCalledWith('d1'));
      expect(await screen.findByText('success')).toBeTruthy();
   });

   it('o toggle desliga o webhook e faz rollback quando a API falha', async () => {
      const user = userEvent.setup();
      const hook = {
         id: 'w1',
         url: 'https://exemplo.com/circle',
         events: ['issue.created'],
         enabled: true,
         createdAt: '2026-09-01T00:00:00.000Z',
         createdByName: 'Owner',
      };
      apiMocks.hooksList.mockResolvedValue([hook]);
      apiMocks.hooksUpdate.mockRejectedValue(new Error('boom'));

      mount(<WebhooksSettings />);
      const toggle = await screen.findByRole('switch', {
         name: 'Ativar https://exemplo.com/circle',
      });
      await user.click(toggle);

      await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
      expect(toggle.getAttribute('data-state')).toBe('checked');
   });
});

describe('Settings → Import/Export (#101)', () => {
   it('o wizard vai de upload a resultado e só grava no commit', async () => {
      const user = userEvent.setup();
      apiMocks.importPreview.mockResolvedValue({
         source: 'linear',
         columns: ['ID', 'Title', 'Status'],
         mapping: { externalId: 'ID', title: 'Title', status: 'Status' },
         totalRows: 2,
         sample: [
            {
               externalId: 'LIN-1',
               title: 'Corrigir login',
               statusRaw: 'In Progress',
               statusId: 'in-progress',
               priorityRaw: null,
               priorityId: null,
               assigneeRaw: null,
               assigneeId: null,
               labels: [],
               dueDate: null,
               estimate: null,
               parentExternalId: null,
               existing: false,
               warnings: [],
            },
         ],
         warnings: ['1 linha(s) sem título serão ignoradas'],
      });
      apiMocks.importCommit.mockResolvedValue({
         created: 2,
         updated: 0,
         skipped: 1,
         errors: [],
         issueIds: ['a', 'b'],
      });

      mount(<ImportExportSettings />);
      const file = new File(['ID,Title,Status\nLIN-1,Corrigir login,In Progress'], 'linear.csv', {
         type: 'text/csv',
      });
      await user.upload(screen.getByLabelText('Arquivo CSV'), file);

      // Passo de mapeamento: nada foi gravado ainda.
      expect(await screen.findByText('Corrigir login')).toBeTruthy();
      expect(screen.getByText('1 linha(s) sem título serão ignoradas')).toBeTruthy();
      expect(apiMocks.importCommit).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: /Importar 2 linha/ }));
      await waitFor(() => expect(apiMocks.importCommit).toHaveBeenCalled());
      expect(apiMocks.importCommit.mock.calls[0][0]).toMatchObject({
         source: 'linear',
         teamId: 'CORE',
         mapping: { title: 'Title' },
      });

      expect(await screen.findByText('Import concluído')).toBeTruthy();
      expect(screen.getByText('2 criada(s) · 0 atualizada(s) · 1 ignorada(s)')).toBeTruthy();
   });
});
