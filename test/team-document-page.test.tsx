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
// `unmountFlush.doc`: como o editor real, o dublê faz FLUSH do pendente ao desmontar.
const unmountFlush = vi.hoisted(() => ({ doc: null as EditorDoc | null }));
// `firstSave`: o onSave da 1ª instância do editor — simula um save ADIADO (ex.: upload em
// curso) que só dispara depois que o editor já foi trocado pelo remount do 409.
const firstSave = vi.hoisted(() => ({ fn: null as ((d: EditorDoc) => void) | null }));
vi.mock('@/components/common/editor/block-editor', async () => {
   const R = await import('react');
   return {
      BlockEditor: ({
         doc,
         onSave,
      }: {
         doc: EditorDoc | null;
         onSave?: (d: EditorDoc) => void;
      }) => {
         const saveRef = R.useRef(onSave);
         saveRef.current = onSave;
         if (!firstSave.fn && onSave) firstSave.fn = onSave;
         R.useEffect(
            () => () => {
               if (unmountFlush.doc) saveRef.current?.(unmountFlush.doc);
            },
            []
         );
         return (
            <div>
               <p data-testid="editor-doc">{JSON.stringify(doc)}</p>
               <button onClick={() => onSave?.(body('novo'))}>fake-save</button>
            </div>
         );
      },
   };
});

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
   unmountFlush.doc = null;
   apiMocks.get.mockReset();
   apiMocks.update.mockReset();
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

   it('409: save adiado do editor antigo, disparado depois do remount, não é gravado', async () => {
      firstSave.fn = null;
      apiMocks.get.mockResolvedValueOnce(dto());
      apiMocks.update.mockRejectedValueOnce(new ApiError(409, 'alterado'));
      apiMocks.get.mockResolvedValueOnce(
         dto({ descriptionDoc: body('da Ana'), descriptionVersion: 'v9' })
      );
      renderView();
      await screen.findByDisplayValue('RFC 1');
      const stale = firstSave.fn!;
      await act(async () => {
         fireEvent.click(screen.getByText('fake-save'));
      });
      await waitFor(() => expect(screen.getByTestId('editor-doc').textContent).toContain('da Ana'));
      // O upload do editor antigo terminou agora: o save dele chega atrasado.
      await act(async () => {
         stale(body('local atrasado'));
      });
      await act(async () => {});
      expect(apiMocks.update).toHaveBeenCalledTimes(1);
   });

   it('409: o flush do editor antigo (remount) não sobrescreve a versão nova', async () => {
      apiMocks.get.mockResolvedValueOnce(dto());
      apiMocks.update.mockRejectedValueOnce(new ApiError(409, 'alterado'));
      apiMocks.get.mockResolvedValueOnce(
         dto({ descriptionDoc: body('da Ana'), descriptionVersion: 'v9' })
      );
      renderView();
      await screen.findByDisplayValue('RFC 1');
      unmountFlush.doc = body('local velho');
      await act(async () => {
         fireEvent.click(screen.getByText('fake-save'));
      });
      await waitFor(() => expect(screen.getByTestId('editor-doc').textContent).toContain('da Ana'));
      unmountFlush.doc = null;
      await act(async () => {
         await new Promise((r) => setTimeout(r, 20));
      });
      expect(apiMocks.update).toHaveBeenCalledTimes(1);

      apiMocks.update.mockResolvedValueOnce(dto({ descriptionVersion: 'v10' }));
      fireEvent.click(screen.getByText('fake-save'));
      await waitFor(() =>
         expect(apiMocks.update).toHaveBeenLastCalledWith('d1', {
            descriptionDoc: body('novo'),
            expectedDescriptionVersion: 'v9',
         })
      );
   });

   it('409 com recarga falhando: o editor fica e o próximo save vai com a versão vista', async () => {
      apiMocks.get.mockResolvedValueOnce(dto());
      apiMocks.update.mockRejectedValue(new ApiError(409, 'alterado'));
      apiMocks.get.mockRejectedValueOnce(new Error('rede'));
      renderView();
      await screen.findByDisplayValue('RFC 1');
      await act(async () => {
         fireEvent.click(screen.getByText('fake-save'));
      });
      await waitFor(() => expect(apiMocks.get).toHaveBeenCalledTimes(2));
      await act(async () => {
         await new Promise((r) => setTimeout(r, 20));
      });
      expect(screen.getByTestId('editor-doc')).toBeTruthy();
      apiMocks.get.mockReturnValueOnce(new Promise(() => {}));
      await act(async () => {
         fireEvent.click(screen.getByText('fake-save'));
      });
      await waitFor(() => expect(apiMocks.update).toHaveBeenCalledTimes(2));
      for (const [, patch] of apiMocks.update.mock.calls)
         expect(patch.expectedDescriptionVersion).toBe('v1');
   });

   it('404 no autosave (apagado por outra aba antes do SSE) mostra "não encontrado"', async () => {
      apiMocks.get.mockResolvedValueOnce(dto());
      apiMocks.update.mockRejectedValueOnce(new ApiError(404, 'x'));
      renderView();
      await screen.findByDisplayValue('RFC 1');
      await act(async () => {
         fireEvent.click(screen.getByText('fake-save'));
      });
      expect(await screen.findByText('Document not found')).toBeTruthy();
      expect(toastMocks.error).not.toHaveBeenCalled();
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
