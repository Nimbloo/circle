// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useIssuesStore } from '@/store/issues-store';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import {
   DELETE_UNDO_CEILING_MS,
   DELETE_UNDO_MS,
   deleteIssuesWithUndo,
} from '@/components/common/issues/delete-with-undo';
import { useIssueDeleteShortcut } from '@/components/common/issues/use-issue-delete-shortcut';

/**
 * is#16: "Delete… ⌘⌫" era anunciado sem handler e a exclusão não tinha Undo. A exclusão
 * some da lista na hora e o DELETE só sai depois da janela de desfazer.
 */

const apiMocks = vi.hoisted(() => ({
   remove: vi.fn(async () => ({ deleted: true })),
   get: vi.fn(async (): Promise<unknown> => {
      throw new Error('offline');
   }),
}));
vi.mock('@/lib/client', () => ({
   api: { issues: { remove: apiMocks.remove, get: apiMocks.get } },
   ApiError: class ApiError extends Error {
      status = 0;
   },
}));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

const make = (id: string): Issue => ({
   id,
   identifier: `ENG-${id}`,
   title: `Issue ${id}`,
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: id,
   teamId: 'ENG',
});

const ids = () => useIssuesStore.getState().issues.map((i) => i.id);

beforeEach(() => {
   vi.clearAllMocks();
   vi.useFakeTimers();
   seedCatalog();
   useIssuesStore.setState({
      issues: [make('a'), make('b'), make('c')],
      remoteDeletedIds: new Set(),
   });
   act(() => useBulkSelectionStore.getState().clear());
});
afterEach(() => vi.useRealTimers());

interface UndoToastOptions {
   duration?: number;
   onAutoClose?: () => void;
   onDismiss?: () => void;
   action?: { label: string; onClick: () => void };
}

/** Opções do último toast com Undo. */
const undoToast = () =>
   toastMock.mock.calls.findLast((c) => (c[1] as UndoToastOptions | undefined)?.action)?.[1] as
      | UndoToastOptions
      | undefined;

/** Última ação do toast com Undo. */
function undoAction() {
   return undoToast()?.action;
}

/** O sonner fecha o toast sozinho (timer esgotado, sem hover). */
const autoClose = () => undoToast()?.onAutoClose?.();

describe('excluir issue com Undo (is#16)', () => {
   it('some da lista na hora e o DELETE só sai quando o toast fecha', async () => {
      act(() => void deleteIssuesWithUndo(['b']));
      expect(ids()).toEqual(['a', 'c']);
      expect(apiMocks.remove).not.toHaveBeenCalled();

      await act(async () => {
         autoClose();
      });
      expect(apiMocks.remove).toHaveBeenCalledWith('b');
   });

   it('Undo devolve a issue na posição e nunca chama o DELETE', async () => {
      act(() => void deleteIssuesWithUndo(['b']));
      expect(undoAction()?.label).toBe('Undo');
      act(() => undoAction()?.onClick());
      expect(ids()).toEqual(['a', 'b', 'c']);

      await act(async () => {
         autoClose();
      });
      expect(apiMocks.remove).not.toHaveBeenCalled();
   });

   it('Undo traz a versão ATUAL da issue (mudança remota da janela não se perde)', async () => {
      act(() => void deleteIssuesWithUndo(['b']));
      const done = status.find((st) => st.category === 'completed')!;
      apiMocks.get.mockResolvedValueOnce({
         id: 'b',
         identifier: 'ENG-b',
         teamId: 'ENG',
         title: 'Issue b',
         status: { id: done.id, name: done.name, color: '', category: done.category },
         priority: { id: priorities[0].id, name: priorities[0].name },
         assignee: null,
         assignees: [],
         createdBy: null,
         project: null,
         cycleId: '',
         labels: [],
         rank: 'b',
         dueDate: null,
         estimate: null,
         subIssueCount: 0,
         subIssueDoneCount: 0,
         snoozedUntil: null,
         createdAt: '2026-01-01T00:00:00.000Z',
         updatedAt: '2026-01-02T00:00:00.000Z',
      });
      await act(async () => {
         undoAction()?.onClick();
      });
      expect(apiMocks.get).toHaveBeenCalledWith('b');
      expect(useIssuesStore.getState().getIssueById('b')?.status.id).toBe(done.id);
   });

   it('removeRemote durante a janela invalida o Undo (outra aba já apagou)', async () => {
      act(() => void deleteIssuesWithUndo(['b']));
      expect(ids()).toEqual(['a', 'c']);

      act(() => useIssuesStore.getState().removeRemote('b'));
      act(() => undoAction()?.onClick());
      expect(ids()).toEqual(['a', 'c']); // não volta

      await act(async () => {
         autoClose();
      });
      expect(apiMocks.remove).not.toHaveBeenCalled(); // sem DELETE inútil (404)
   });

   it('DELETE que falha devolve a issue para a lista', async () => {
      apiMocks.remove.mockRejectedValueOnce(new Error('boom'));
      act(() => void deleteIssuesWithUndo(['b']));
      await act(async () => {
         autoClose();
         await Promise.resolve();
         await Promise.resolve();
      });
      expect(ids()).toEqual(['a', 'b', 'c']);
   });

   it('DELETE em voo que falha depois de outra aba apagar não devolve a issue', async () => {
      let reject!: (e: unknown) => void;
      apiMocks.remove.mockImplementationOnce(
         () => new Promise((_, r) => (reject = r)) as Promise<{ deleted: boolean }>
      );
      act(() => void deleteIssuesWithUndo(['b']));
      await act(async () => {
         autoClose();
      });
      expect(apiMocks.remove).toHaveBeenCalledWith('b');
      act(() => useIssuesStore.getState().removeRemote('b'));
      await act(async () => {
         reject(Object.assign(new Error('not found'), { status: 404 }));
         await Promise.resolve();
         await Promise.resolve();
      });
      expect(ids()).toEqual(['a', 'c']);
      expect(toastMock.error).not.toHaveBeenCalled();
   });

   it('sair da página dentro da janela envia o DELETE na hora (sem perder a exclusão)', () => {
      act(() => void deleteIssuesWithUndo(['b']));
      expect(apiMocks.remove).not.toHaveBeenCalled();
      act(() => void window.dispatchEvent(new Event('pagehide')));
      expect(apiMocks.remove).toHaveBeenCalledWith('b');
   });

   it('toast pausado (hover) passa dos 6 s e o Undo ainda desfaz', async () => {
      act(() => void deleteIssuesWithUndo(['b']));
      await act(async () => {
         vi.advanceTimersByTime(DELETE_UNDO_MS * 3);
      });
      expect(apiMocks.remove).not.toHaveBeenCalled();
      act(() => undoAction()?.onClick());
      expect(ids()).toEqual(['a', 'b', 'c']);
      act(() => autoClose());
      expect(apiMocks.remove).not.toHaveBeenCalled();
   });

   it('dispensar o toast (X/swipe) envia o DELETE', () => {
      act(() => void deleteIssuesWithUndo(['b']));
      act(() => undoToast()?.onDismiss?.());
      expect(apiMocks.remove).toHaveBeenCalledWith('b');
   });

   it('teto de segurança envia o DELETE se o toast nunca fechar', async () => {
      act(() => void deleteIssuesWithUndo(['b']));
      await act(async () => {
         vi.advanceTimersByTime(DELETE_UNDO_CEILING_MS + 10);
      });
      expect(apiMocks.remove).toHaveBeenCalledTimes(1);
   });

   it('Undo depois do DELETE enviado avisa que a issue já foi excluída', async () => {
      act(() => void deleteIssuesWithUndo(['b']));
      act(() => void window.dispatchEvent(new Event('pagehide')));
      const undo = undoAction();
      toastMock.mockClear();
      act(() => undo?.onClick());
      expect(toastMock).toHaveBeenCalledWith('Issue já foi excluída');
      expect(ids()).toEqual(['a', 'c']);
   });

   it('issue fora do store (deep-link frio) é excluída pela issue do contexto', async () => {
      const cold = make('z');
      expect(deleteIssuesWithUndo(['z'], { fallback: [cold] })).toBe(true);
      expect(toastMock).toHaveBeenCalledWith('ENG-z deleted', expect.anything());
      await act(async () => {
         autoClose();
      });
      expect(apiMocks.remove).toHaveBeenCalledWith('z');
   });

   it('Undo da issue fria cancela o DELETE sem injetá-la na lista', async () => {
      deleteIssuesWithUndo(['z'], { fallback: [make('z')] });
      act(() => undoAction()?.onClick());
      act(() => autoClose());
      expect(apiMocks.remove).not.toHaveBeenCalled();
      expect(ids()).toEqual(['a', 'b', 'c']);
   });

   it('sem issue no store nem no contexto não faz nada', () => {
      expect(deleteIssuesWithUndo(['z'])).toBe(false);
      expect(toastMock).not.toHaveBeenCalled();
   });

   it('o toast dura exatamente a janela de desfazer', () => {
      act(() => void deleteIssuesWithUndo(['b']));
      const opts = toastMock.mock.calls.at(-1)?.[1] as { duration?: number };
      expect(opts.duration).toBe(DELETE_UNDO_MS);
   });

   it('⌘⌫ exclui a seleção em lote e limpa a seleção', () => {
      function Host() {
         useIssueDeleteShortcut();
         return null;
      }
      render(<Host />);
      act(() => useBulkSelectionStore.getState().set(['a', 'c']));
      act(() => {
         fireEvent.keyDown(window, { key: 'Backspace', metaKey: true });
      });
      expect(ids()).toEqual(['b']);
      expect(useBulkSelectionStore.getState().selected.size).toBe(0);
   });

   it('⌘⌫ exclui a issue do contexto quando não há seleção', () => {
      function Host() {
         useIssueDeleteShortcut('c');
         return null;
      }
      render(<Host />);
      act(() => {
         fireEvent.keyDown(window, { key: 'Backspace', ctrlKey: true });
      });
      expect(ids()).toEqual(['a', 'b']);
   });

   it('o atalho ignora digitação em campo de texto', () => {
      function Host() {
         useIssueDeleteShortcut('c');
         return <input aria-label="campo" />;
      }
      const { getByLabelText } = render(<Host />);
      act(() => {
         fireEvent.keyDown(getByLabelText('campo'), { key: 'Backspace', metaKey: true });
      });
      expect(ids()).toEqual(['a', 'b', 'c']);
   });

   it('com dialog/menu aberto o atalho não exclui o que está por baixo', () => {
      function Host() {
         useIssueDeleteShortcut('c');
         return (
            <div role="dialog" data-state="open">
               <button>Salvar</button>
            </div>
         );
      }
      const { getByText } = render(<Host />);
      act(() => useBulkSelectionStore.getState().set(['a']));
      act(() => {
         fireEvent.keyDown(getByText('Salvar'), { key: 'Backspace', metaKey: true });
      });
      expect(ids()).toEqual(['a', 'b', 'c']);
      expect(useBulkSelectionStore.getState().selected.size).toBe(1);
   });
});
