// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Diálogo de exclusão de time (cascata, paridade Linear): mostra o que será apagado,
 * exige o nome do time e só comemora depois que a API confirma.
 */

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: '/acme/team/DOOM/all' }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'acme' }),
   usePathname: () => nav.pathname,
   useRouter: () => ({ push: nav.push }),
}));
const apiMocks = vi.hoisted(() => ({ deletionImpact: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/client', () => {
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
      api: { teams: { deletionImpact: apiMocks.deletionImpact, remove: apiMocks.remove } },
   };
});
const store = vi.hoisted(() => ({ removeTeamLocal: vi.fn() }));
vi.mock('@/store/workspace-store', () => ({
   useWorkspaceStore: (selector: (s: typeof store) => unknown) => selector(store),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const { DeleteTeamDialog } = await import('@/components/common/teams/delete-team-dialog');
const { ApiError } = await import('@/lib/client');

const TEAM = { id: 'DOOM', name: 'Doom' };
const IMPACT = { issues: 12, projects: 3, cycles: 2, views: 1, folders: 4, documents: 1 };

function deferred<T>() {
   let resolve!: (v: T) => void;
   const promise = new Promise<T>((res) => (resolve = res));
   return { promise, resolve };
}

function renderDialog(onOpenChange = vi.fn()) {
   render(<DeleteTeamDialog team={TEAM} open onOpenChange={onOpenChange} />);
   return onOpenChange;
}

const confirmButton = () => screen.getByRole('button', { name: 'Excluir time' });

beforeEach(() => {
   vi.clearAllMocks();
   nav.pathname = '/acme/team/DOOM/all';
   apiMocks.deletionImpact.mockResolvedValue(IMPACT);
   apiMocks.remove.mockResolvedValue({ deleted: true });
});

describe('DeleteTeamDialog', () => {
   it('busca o impacto ao abrir e lista o que será excluído', async () => {
      const impact = deferred<typeof IMPACT>();
      apiMocks.deletionImpact.mockReturnValue(impact.promise);
      renderDialog();
      expect(screen.getByRole('status', { name: 'Verificando o conteúdo do time…' })).toBeTruthy();
      expect(apiMocks.deletionImpact).toHaveBeenCalledWith('DOOM');

      impact.resolve(IMPACT);
      const list = await screen.findByRole('list', { name: 'Conteúdo que será excluído' });
      const items = Array.from(list.querySelectorAll('li')).map((li) => li.textContent);
      expect(items).toEqual([
         '12 issues',
         '3 projetos',
         '2 ciclos',
         '1 view',
         '4 pastas de documentos',
         '1 documento',
      ]);
   });

   it('omite o que o time não tem e avisa quando não há conteúdo', async () => {
      apiMocks.deletionImpact.mockResolvedValue({
         issues: 0,
         projects: 0,
         cycles: 0,
         views: 0,
         folders: 0,
         documents: 0,
      });
      renderDialog();
      expect(
         await screen.findByText('O time não tem conteúdo; só a configuração dele será removida.')
      ).toBeTruthy();
      expect(screen.queryByRole('list', { name: 'Conteúdo que será excluído' })).toBeNull();
   });

   it('o botão de excluir só habilita com o nome exato do time', async () => {
      const user = userEvent.setup();
      renderDialog();
      await screen.findByRole('list', { name: 'Conteúdo que será excluído' });
      const input = screen.getByLabelText(/para confirmar/);

      expect((confirmButton() as HTMLButtonElement).disabled).toBe(true);
      await user.type(input, 'doom');
      expect((confirmButton() as HTMLButtonElement).disabled).toBe(true);
      await user.clear(input);
      await user.type(input, 'Doom');
      expect((confirmButton() as HTMLButtonElement).disabled).toBe(false);
   });

   it('toast de sucesso, poda do store e navegação só depois da API', async () => {
      const user = userEvent.setup();
      const done = deferred<{ deleted: boolean }>();
      apiMocks.remove.mockReturnValue(done.promise);
      const onOpenChange = renderDialog();
      await screen.findByRole('list', { name: 'Conteúdo que será excluído' });
      await user.type(screen.getByLabelText(/para confirmar/), 'Doom');
      await user.click(confirmButton());

      expect(apiMocks.remove).toHaveBeenCalledWith('DOOM');
      expect(toast.success).not.toHaveBeenCalled();
      expect(store.removeTeamLocal).not.toHaveBeenCalled();
      expect(nav.push).not.toHaveBeenCalled();

      done.resolve({ deleted: true });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Time excluído'));
      expect(store.removeTeamLocal).toHaveBeenCalledWith('DOOM');
      expect(onOpenChange).toHaveBeenCalledWith(false);
      // A tela atual era do time: sai dela.
      expect(nav.push).toHaveBeenCalledWith('/acme');
   });

   it('fora de uma tela do time, não navega', async () => {
      nav.pathname = '/acme/my-issues';
      const user = userEvent.setup();
      renderDialog();
      await screen.findByRole('list', { name: 'Conteúdo que será excluído' });
      await user.type(screen.getByLabelText(/para confirmar/), 'Doom');
      await user.click(confirmButton());
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(nav.push).not.toHaveBeenCalled();
   });

   it('erro da API vira toast com a mensagem e nada é podado', async () => {
      const user = userEvent.setup();
      apiMocks.remove.mockRejectedValue(new ApiError(403, 'Apenas admin'));
      renderDialog();
      await screen.findByRole('list', { name: 'Conteúdo que será excluído' });
      await user.type(screen.getByLabelText(/para confirmar/), 'Doom');
      await user.click(confirmButton());

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Apenas admin'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(store.removeTeamLocal).not.toHaveBeenCalled();
   });
});
