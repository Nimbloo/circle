// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo', teamId: 'CORE' }) }));
const apiMocks = vi.hoisted(() => ({
   documents: vi.fn(),
   remove: vi.fn(),
   update: vi.fn(),
   updateFolder: vi.fn(),
   removeFolder: vi.fn(),
}));
vi.mock('@/lib/client', () => ({
   api: {
      teams: { documents: apiMocks.documents },
      documents: {
         remove: apiMocks.remove,
         update: apiMocks.update,
         updateFolder: apiMocks.updateFolder,
         removeFolder: apiMocks.removeFolder,
      },
   },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: TeamDocuments } = await import('@/components/common/teams/team-documents');

const folder = (over: Record<string, unknown> = {}) => ({
   id: 'f1',
   teamId: 'CORE',
   name: 'Specs',
   icon: null,
   documents: [
      {
         id: 'd1',
         folderId: 'f1',
         name: 'RFC',
         icon: null,
         pinned: false,
         creator: { id: 'u', slug: 'u', name: 'Ana', email: 'a@x', avatarUrl: null },
         createdAt: '2026-09-01T00:00:00Z',
         updatedAt: '2026-09-01T00:00:00Z',
      },
   ],
   ...over,
});

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.documents.mockResolvedValue([folder()]);
   apiMocks.updateFolder.mockResolvedValue({ id: 'f1', teamId: 'CORE', name: 'RFCs', icon: null });
   apiMocks.removeFolder.mockResolvedValue({ deleted: true });
});

describe('lista de documentos do time', () => {
   it('a linha do documento abre o documento', async () => {
      render(<TeamDocuments />);
      const link = await screen.findByRole('link', { name: /RFC/ });
      expect(link.getAttribute('href')).toBe('/nimbloo/team/CORE/documents/d1');
   });

   it('pasta pode ser renomeada', async () => {
      const user = userEvent.setup();
      render(<TeamDocuments />);
      await user.click(await screen.findByRole('button', { name: 'Folder actions for Specs' }));
      await user.click(await screen.findByRole('menuitem', { name: /Rename/ }));
      const input = await screen.findByDisplayValue('Specs');
      fireEvent.change(input, { target: { value: 'RFCs' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
         expect(apiMocks.updateFolder).toHaveBeenCalledWith('f1', { name: 'RFCs', icon: '📁' })
      );
   });

   it('excluir pasta avisa quantos documentos vão junto e só apaga ao confirmar', async () => {
      const user = userEvent.setup();
      render(<TeamDocuments />);
      await user.click(await screen.findByRole('button', { name: 'Folder actions for Specs' }));
      await user.click(await screen.findByRole('menuitem', { name: /Delete folder/ }));
      expect(await screen.findByText(/1 documento/)).toBeTruthy();
      expect(apiMocks.removeFolder).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Excluir pasta' }));
      await waitFor(() => expect(apiMocks.removeFolder).toHaveBeenCalledWith('f1'));
   });

   it('falha de carga oferece tentar de novo', async () => {
      apiMocks.documents.mockReset();
      apiMocks.documents.mockRejectedValueOnce(new Error('rede'));
      apiMocks.documents.mockResolvedValueOnce([folder()]);
      render(<TeamDocuments />);
      fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
      expect(await screen.findByRole('link', { name: /RFC/ })).toBeTruthy();
   });
});
