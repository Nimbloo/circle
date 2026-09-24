// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
   Object.defineProperty(Element.prototype, method, { configurable: true, value: () => false });
}
vi.mock('next/navigation', () => ({ useParams: () => ({ teamId: 'CORE' }) }));
const apiMocks = vi.hoisted(() => ({
   documents: vi.fn(),
   remove: vi.fn(),
   update: vi.fn(),
   createDocument: vi.fn(),
}));
vi.mock('@/lib/client', () => ({
   api: {
      teams: { documents: apiMocks.documents, createDocument: apiMocks.createDocument },
      documents: { remove: apiMocks.remove, update: apiMocks.update },
   },
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const { default: TeamDocuments } = await import('@/components/common/teams/team-documents');

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.documents.mockResolvedValue([
      {
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
      },
   ]);
   apiMocks.remove.mockResolvedValue({ deleted: true });
});

describe('excluir documento pede confirmação (Ad#21–40)', () => {
   it('Delete abre a confirmação; só o Excluir chama a API', async () => {
      const user = userEvent.setup();
      render(<TeamDocuments />);
      await user.click(await screen.findByRole('button', { name: 'Document actions for RFC' }));
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
      await screen.findByText('Excluir “RFC”?');
      expect(apiMocks.remove).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledWith('d1'));
   });
});

describe('auditoria de diálogos — exclusão e recarga', () => {
   it('duplo clique no Excluir manda UM DELETE (botão desabilitado enquanto exclui)', async () => {
      let resolve!: (v: { deleted: boolean }) => void;
      apiMocks.remove.mockImplementation(() => new Promise((r) => (resolve = r)));
      const user = userEvent.setup();
      render(<TeamDocuments />);
      await user.click(await screen.findByRole('button', { name: 'Document actions for RFC' }));
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
      const confirm = await screen.findByRole('button', { name: 'Excluir' });
      await user.click(confirm);
      await user.click(confirm);
      expect(apiMocks.remove).toHaveBeenCalledTimes(1);
      expect((confirm as HTMLButtonElement).disabled).toBe(true);
      await act(async () => resolve({ deleted: true }));
      expect(toastMock.error).not.toHaveBeenCalled();
   });

   it('rename salvo com recarga falhando: sucesso da mutação, sem erro e lista mantida', async () => {
      apiMocks.update.mockResolvedValue({ id: 'd1' });
      const user = userEvent.setup();
      render(<TeamDocuments />);
      await user.click(await screen.findByRole('button', { name: 'Document actions for RFC' }));
      await user.click(await screen.findByRole('menuitem', { name: /Rename/ }));
      apiMocks.documents.mockRejectedValue(new Error('Failed to fetch'));
      await user.click(await screen.findByRole('button', { name: 'Save' }));
      await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Documento atualizado'));
      expect(toastMock.error).not.toHaveBeenCalled();
      await waitFor(() => expect(toastMock.warning).toHaveBeenCalled());
      expect(screen.queryByText('Não foi possível carregar os documentos')).toBeNull();
      expect(screen.getByText('RFC')).toBeTruthy();
   });

   it('recarga mais antiga que responde depois não reverte a mais nova (CodeRabbit #190)', async () => {
      const doc = (id: string, name: string) => ({
         id,
         folderId: 'f1',
         name,
         icon: null,
         pinned: false,
         creator: { id: 'u', slug: 'u', name: 'Ana', email: 'a@x', avatarUrl: null },
         createdAt: '2026-09-01T00:00:00Z',
         updatedAt: '2026-09-01T00:00:00Z',
      });
      const folder = (docs: ReturnType<typeof doc>[]) => [
         { id: 'f1', teamId: 'CORE', name: 'Specs', icon: null, documents: docs },
      ];
      apiMocks.documents.mockResolvedValueOnce(folder([doc('d1', 'RFC'), doc('d2', 'ADR')]));
      const user = userEvent.setup();
      render(<TeamDocuments />);

      // 1ª exclusão: a recarga dela fica pendurada (servidor ainda com a d2).
      let resolveOld!: (v: unknown) => void;
      apiMocks.documents.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)));
      await user.click(await screen.findByRole('button', { name: 'Document actions for RFC' }));
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
      await user.click(await screen.findByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(apiMocks.documents).toHaveBeenCalledTimes(2));

      // 2ª exclusão: a recarga dela responde primeiro (lista vazia).
      apiMocks.documents.mockResolvedValueOnce(folder([]));
      await user.click(await screen.findByRole('button', { name: 'Document actions for ADR' }));
      await user.click(await screen.findByRole('menuitem', { name: /Delete/ }));
      await user.click(await screen.findByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(apiMocks.documents).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(screen.queryByText('ADR')).toBeNull());

      // A recarga antiga chega por último com a d2: não pode trazê-la de volta.
      await act(async () => resolveOld(folder([doc('d2', 'ADR')])));
      expect(screen.queryByText('ADR')).toBeNull();
   });

   it('documento criado com recarga falhando: sucesso, lista mantida e sem tela de erro', async () => {
      apiMocks.createDocument.mockResolvedValue({ id: 'd9' });
      const user = userEvent.setup();
      render(<TeamDocuments />);
      await screen.findByText('RFC');
      await user.click(screen.getByRole('button', { name: /New document/ }));
      await user.type(await screen.findByPlaceholderText('Document name'), 'Runbook');
      apiMocks.documents.mockRejectedValue(new Error('Failed to fetch'));
      await user.click(screen.getByRole('button', { name: /Create document/ }));
      await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Documento criado'));
      await waitFor(() => expect(toastMock.warning).toHaveBeenCalled());
      expect(screen.queryByText('Não foi possível carregar os documentos')).toBeNull();
      expect(screen.getByText('RFC')).toBeTruthy();
   });
});
