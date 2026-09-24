// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDetailDto } from '@/lib/api/project-detail';
import type { EditorDoc } from '@/lib/editor-doc';
import { ProjectDetailProvider } from '@/components/common/projects/details/use-project-detail';
import ProjectOverview from '@/components/common/projects/details/project-overview';
import { useWorkspaceStore } from '@/store/workspace-store';
import { PROJECT_CHANGED_EVENT } from '@/lib/use-live-sync';
import { makeProject } from './helpers/project-fixture';

/**
 * Descrição do projeto com concorrência otimista (#18) — lado do cliente: no 409 o
 * editor remonta com a versão do servidor, e o flush do editor antigo (unmount) NÃO pode
 * gravar o doc velho por cima da versão nova. Nenhum save sai sem versão depois da
 * 1ª carga.
 */
const mocks = vi.hoisted(() => ({ detail: vi.fn(), updateDetail: vi.fn() }));
const toastMocks = vi.hoisted(() => ({
   success: vi.fn(),
   error: vi.fn(),
   warning: vi.fn(),
}));

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
      api: {
         projects: { detail: mocks.detail, updateDetail: mocks.updateDetail },
         projectSnapshots: { list: vi.fn(async () => []) },
         projectDependencies: { list: vi.fn(async () => []) },
      },
   };
});
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/project/p1/overview',
   useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('nuqs', async (importOriginal) => ({
   ...(await importOriginal<typeof import('nuqs')>()),
   useQueryState: () => [null, vi.fn()],
   useQueryStates: () => [{}, vi.fn()],
}));
vi.mock('sonner', () => ({ toast: toastMocks }));

const docOf = (text: string): EditorDoc => ({
   type: 'doc',
   content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

// Dublê do editor: mostra o texto, expõe o save e, como o real, faz FLUSH no unmount.
vi.mock('@/components/common/editor/block-editor', async () => {
   const R = await import('react');
   return {
      BlockEditor: ({ doc, onSave }: { doc: EditorDoc | null; onSave?: (d: EditorDoc) => void }) => {
         const saveRef = R.useRef(onSave);
         saveRef.current = onSave;
         R.useEffect(() => () => saveRef.current?.(docOf('flush do editor antigo')), []);
         const text =
            (doc?.content?.[0] as { content?: { text: string }[] } | undefined)?.content?.[0]
               ?.text ?? '';
         return R.createElement(
            'div',
            null,
            R.createElement('span', { 'data-testid': 'doc' }, text),
            R.createElement('button', { onClick: () => onSave?.(docOf('minha')) }, 'salvar')
         );
      },
   };
});

const { ApiError } = await import('@/lib/client');

function dto(text: string, version: string): ProjectDetailDto {
   return {
      projectId: 'p1',
      summary: '',
      description: [],
      descriptionDoc: docOf(text),
      milestones: [],
      resources: [],
      updates: [],
      activity: [],
      descriptionVersion: version,
   };
}

const renderOverview = () =>
   render(
      <ProjectDetailProvider projectId="p1">
         <ProjectOverview projectId="p1" />
      </ProjectDetailProvider>
   );

beforeEach(() => {
   vi.clearAllMocks();
   mocks.detail.mockReset();
   mocks.updateDetail.mockReset();
   useWorkspaceStore.setState({
      projects: [makeProject({ id: 'p1', name: 'Apollo' })],
      loaded: true,
   });
});

describe('descrição do projeto: conflito (409)', () => {
   it('remonta com a versão do servidor e descarta o flush do editor antigo', async () => {
      mocks.detail.mockResolvedValueOnce(dto('original', 'v1'));
      renderOverview();
      await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('original'));

      mocks.updateDetail.mockRejectedValueOnce(new ApiError(409, 'conflito'));
      mocks.detail.mockResolvedValue(dto('da outra pessoa', 'v2'));
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('da outra pessoa'));
      await act(async () => {
         await new Promise((r) => setTimeout(r, 20));
      });

      // Só o save que deu 409; o flush do unmount não sobrescreveu a versão v2.
      expect(mocks.updateDetail).toHaveBeenCalledTimes(1);
      expect(toastMocks.warning).toHaveBeenCalled();

      mocks.updateDetail.mockResolvedValueOnce(dto('minha', 'v3'));
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() =>
         expect(mocks.updateDetail).toHaveBeenLastCalledWith('p1', {
            descriptionDoc: docOf('minha'),
            expectedDescriptionVersion: 'v2',
         })
      );
   });

   it('409 com recarga falhando: nenhum save sai sem versão', async () => {
      mocks.detail.mockResolvedValueOnce(dto('original', 'v1'));
      renderOverview();
      await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('original'));

      mocks.updateDetail.mockRejectedValue(new ApiError(409, 'conflito'));
      mocks.detail.mockRejectedValue(new Error('rede'));
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(2));
      await act(async () => {
         await new Promise((r) => setTimeout(r, 20));
      });
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() => expect(mocks.updateDetail).toHaveBeenCalledTimes(2));

      for (const [, body] of mocks.updateDetail.mock.calls)
         expect(body.expectedDescriptionVersion).toBe('v1');
   });
});

describe('descrição do projeto: eco e refetch fora de ordem', () => {
   it('eco do próprio autosave (own + scope content) não refaz o GET', async () => {
      mocks.detail.mockResolvedValue(dto('original', 'v1'));
      renderOverview();
      await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('original'));
      act(() => {
         window.dispatchEvent(
            new CustomEvent(PROJECT_CHANGED_EVENT, {
               detail: { id: 'p1', own: true, scope: 'content' },
            })
         );
      });
      await act(async () => {
         await new Promise((r) => setTimeout(r, 20));
      });
      expect(mocks.detail).toHaveBeenCalledTimes(1);
   });

   it('refetch que saiu antes de um save confirmado não reverte a descrição', async () => {
      mocks.detail.mockResolvedValueOnce(dto('original', 'v1'));
      renderOverview();
      await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('original'));

      let resolveStale!: (v: ProjectDetailDto) => void;
      mocks.detail.mockReturnValueOnce(new Promise((r) => (resolveStale = r)));
      act(() => {
         window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT, { detail: { id: 'p1' } }));
      });
      await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(2));

      mocks.updateDetail.mockResolvedValueOnce(dto('minha', 'v2'));
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() => expect(mocks.updateDetail).toHaveBeenCalledTimes(1));
      await act(async () => {
         await new Promise((r) => setTimeout(r, 10));
      });

      await act(async () => resolveStale(dto('antes do save', 'v1')));
      await act(async () => {
         await new Promise((r) => setTimeout(r, 10));
      });
      expect(screen.getByTestId('doc').textContent).not.toBe('antes do save');

      mocks.updateDetail.mockResolvedValueOnce(dto('minha', 'v3'));
      await act(async () => screen.getByText('salvar').click());
      await waitFor(() =>
         expect(mocks.updateDetail).toHaveBeenLastCalledWith('p1', {
            descriptionDoc: docOf('minha'),
            expectedDescriptionVersion: 'v2',
         })
      );
   });
});
