// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { EditorDoc } from '@/lib/editor-doc';

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

const { ApiError } = await vi.importActual<typeof import('@/lib/client')>('@/lib/client');
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/client', async (orig) => ({
   ...(await orig<typeof import('@/lib/client')>()),
   api: { documents: apiMocks },
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));
const push = vi.fn();
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', teamId: 'CORE', documentId: 'd1' }),
   usePathname: () => '/nimbloo/team/CORE/documents/d1',
   useRouter: () => ({ push }),
}));

// Editor de blocos substituído por um dublê: mostra o texto do doc e expõe o save.
const body = (text: string): EditorDoc => ({
   type: 'doc',
   content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
vi.mock('@/components/common/editor/block-editor', () => ({
   BlockEditor: ({ doc, onSave }: { doc: EditorDoc | null; onSave?: (d: EditorDoc) => void }) => (
      <div>
         <p data-testid="editor-doc">{JSON.stringify(doc)}</p>
         <button onClick={() => onSave?.(body('novo'))}>fake-save</button>
      </div>
   ),
}));

const { default: TeamDocumentView } = await import('@/components/common/teams/team-document');
const { SidebarProvider } = await import('@/components/ui/sidebar');

const dto = (over: Record<string, unknown> = {}) => ({
   id: 'd1',
   folderId: 'f1',
   folderName: 'Specs',
   teamId: 'CORE',
   name: 'RFC 1',
   icon: '📄',
   creator: { id: 'me', slug: 'me', name: 'Me', email: 'me@x', avatarUrl: null },
   pinned: false,
   createdAt: '2026-09-01T00:00:00.000Z',
   updatedAt: '2026-09-02T00:00:00.000Z',
   descriptionDoc: body('olá'),
   descriptionVersion: 'v1',
   ...over,
});

const renderView = () =>
   render(
      <SidebarProvider>
         <TeamDocumentView teamId="CORE" documentId="d1" />
      </SidebarProvider>
   );

beforeEach(() => {
   vi.clearAllMocks();
   useWorkspaceStore.setState({
      me: { id: 'me', admin: false } as never,
      loaded: true,
      teams: [{ id: 'CORE', name: 'Core', icon: '🛠️', members: [] }] as never,
   });
});

describe('página do documento (corpo com editor de blocos)', () => {
   it('carrega e mostra o nome e o corpo', async () => {
      apiMocks.get.mockResolvedValueOnce(dto());
      renderView();
      expect(await screen.findByDisplayValue('RFC 1')).toBeTruthy();
      expect(screen.getByTestId('editor-doc').textContent).toContain('olá');
   });

   it('autosave manda a versão vista e adota a nova', async () => {
      apiMocks.get.mockResolvedValueOnce(dto());
      apiMocks.update.mockResolvedValueOnce(
         dto({ descriptionDoc: body('novo'), descriptionVersion: 'v2' })
      );
      apiMocks.update.mockResolvedValueOnce(dto({ descriptionVersion: 'v3' }));
      renderView();
      await screen.findByDisplayValue('RFC 1');
      fireEvent.click(screen.getByText('fake-save'));
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenCalledWith('d1', {
            descriptionDoc: body('novo'),
            expectedDescriptionVersion: 'v1',
         })
      );
      fireEvent.click(screen.getByText('fake-save'));
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenLastCalledWith('d1', {
            descriptionDoc: body('novo'),
            expectedDescriptionVersion: 'v2',
         })
      );
   });

   it('409: avisa e recarrega a versão de quem gravou no meio', async () => {
      apiMocks.get.mockResolvedValueOnce(dto());
      apiMocks.update.mockRejectedValueOnce(new ApiError(409, 'alterado'));
      apiMocks.get.mockResolvedValueOnce(
         dto({ descriptionDoc: body('da Ana'), descriptionVersion: 'v9' })
      );
      renderView();
      await screen.findByDisplayValue('RFC 1');
      await act(async () => {
         fireEvent.click(screen.getByText('fake-save'));
      });
      await waitFor(() => expect(toastMocks.warning).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByTestId('editor-doc').textContent).toContain('da Ana'));
   });

   it('documento inexistente mostra "não encontrado"; falha de rede mostra retry', async () => {
      apiMocks.get.mockRejectedValueOnce(new ApiError(404, 'x'));
      const { unmount } = renderView();
      expect(await screen.findByText('Document not found')).toBeTruthy();
      unmount();

      apiMocks.get.mockRejectedValueOnce(new Error('rede'));
      apiMocks.get.mockResolvedValueOnce(dto());
      renderView();
      fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
      expect(await screen.findByDisplayValue('RFC 1')).toBeTruthy();
   });

   it('renomear pelo título salva no Enter', async () => {
      apiMocks.get.mockResolvedValueOnce(dto());
      apiMocks.update.mockResolvedValueOnce(dto({ name: 'RFC 2' }));
      renderView();
      const title = await screen.findByDisplayValue('RFC 1');
      fireEvent.change(title, { target: { value: 'RFC 2' } });
      fireEvent.keyDown(title, { key: 'Enter' });
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith('d1', { name: 'RFC 2' }));
   });
});
