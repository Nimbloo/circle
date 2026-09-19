// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatalogStore } from '@/store/catalog-store';

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

class FakeApiError extends Error {
   constructor(
      public readonly status: number,
      message: string
   ) {
      super(message);
   }
}

const apiMocks = vi.hoisted(() => ({
   createLabel: vi.fn(),
   updateLabel: vi.fn(),
   removeLabel: vi.fn(),
   createGroup: vi.fn(),
   updateGroup: vi.fn(),
   removeGroup: vi.fn(),
}));
vi.mock('@/lib/client', () => ({
   ApiError: FakeApiError,
   api: {
      labels: {
         create: apiMocks.createLabel,
         update: apiMocks.updateLabel,
         remove: apiMocks.removeLabel,
      },
      labelGroups: {
         create: apiMocks.createGroup,
         update: apiMocks.updateGroup,
         remove: apiMocks.removeGroup,
      },
   },
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

const { default: IssueLabelsSettings } = await import(
   '@/components/common/settings/issue-labels-settings'
);
const { SidebarProvider } = await import('@/components/ui/sidebar');

const wrap = () =>
   render(
      <SidebarProvider>
         <IssueLabelsSettings />
      </SidebarProvider>
   );

beforeEach(() => {
   vi.clearAllMocks();
   useCatalogStore.setState({
      loaded: true,
      labels: [
         { id: 'bug', name: 'Bug', color: 'red', groupId: 'kind' },
         { id: 'feature', name: 'Feature', color: 'green', groupId: 'kind' },
         { id: 'design', name: 'Design', color: 'pink', groupId: null },
      ],
      labelGroups: [{ id: 'kind', name: 'Type', color: 'gray', position: 0 }],
   });
});

describe('Issue labels: grupos (paridade Linear)', () => {
   it('mostra as labels do grupo aninhadas sob ele e as soltas fora', () => {
      wrap();
      const group = screen.getByRole('group', { name: 'Type' });
      expect(within(group).getByText('Bug')).toBeTruthy();
      expect(within(group).getByText('Feature')).toBeTruthy();
      expect(within(group).queryByText('Design')).toBeNull();
      expect(screen.getByText('Design')).toBeTruthy();
   });

   it('cria um grupo pelo diálogo e ele entra no catálogo', async () => {
      apiMocks.createGroup.mockResolvedValueOnce({
         id: 'area',
         name: 'Area',
         color: 'gray',
         position: 1,
      });
      wrap();
      fireEvent.click(screen.getByRole('button', { name: 'New group' }));
      fireEvent.change(await screen.findByPlaceholderText('Group name'), {
         target: { value: 'Area' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
      await waitFor(() => expect(apiMocks.createGroup).toHaveBeenCalledWith({ name: 'Area' }));
      await waitFor(() =>
         expect(useCatalogStore.getState().labelGroups.map((g) => g.id)).toContain('area')
      );
   });

   it('excluir grupo pede confirmação e solta as labels (continuam na lista)', async () => {
      apiMocks.removeGroup.mockResolvedValueOnce({ deleted: true });
      wrap();
      fireEvent.click(screen.getByRole('button', { name: 'Delete group Type' }));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete group' }));
      await waitFor(() => expect(apiMocks.removeGroup).toHaveBeenCalledWith('kind'));
      await waitFor(() => expect(screen.queryByRole('group', { name: 'Type' })).toBeNull());
      expect(useCatalogStore.getState().labels.find((l) => l.id === 'bug')?.groupId).toBeNull();
   });

   it('label duplicada mostra o motivo do servidor e não vaza rejeição', async () => {
      apiMocks.createLabel.mockRejectedValueOnce(new FakeApiError(409, "Label 'Bug' já existe"));
      wrap();
      fireEvent.click(screen.getByRole('button', { name: 'New label' }));
      fireEvent.change(await screen.findByPlaceholderText('Label name'), {
         target: { value: 'Bug' },
      });
      await act(async () => {
         fireEvent.click(screen.getByRole('button', { name: 'Create label' }));
      });
      await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
      expect(String(toastMocks.error.mock.calls[0][0])).toMatch(/já existe/);
      // O diálogo segue aberto para correção.
      expect(screen.getByPlaceholderText('Label name')).toBeTruthy();
   });

   it('nova label pode nascer dentro de um grupo', async () => {
      apiMocks.createLabel.mockResolvedValueOnce({
         id: 'chore',
         name: 'Chore',
         color: '#6771c5',
         groupId: 'kind',
      });
      wrap();
      fireEvent.click(screen.getByRole('button', { name: 'Add label to Type' }));
      fireEvent.change(await screen.findByPlaceholderText('Label name'), {
         target: { value: 'Chore' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create label' }));
      await waitFor(() =>
         expect(apiMocks.createLabel).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Chore', groupId: 'kind' })
         )
      );
   });
});
