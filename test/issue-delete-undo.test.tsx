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
import { DELETE_UNDO_MS, deleteIssuesWithUndo } from '@/components/common/issues/delete-with-undo';
import { useIssueDeleteShortcut } from '@/components/common/issues/use-issue-delete-shortcut';

/**
 * is#16: "Delete… ⌘⌫" era anunciado sem handler e a exclusão não tinha Undo. A exclusão
 * some da lista na hora e o DELETE só sai depois da janela de desfazer.
 */

const apiMocks = vi.hoisted(() => ({ remove: vi.fn(async () => ({ deleted: true })) }));
vi.mock('@/lib/client', () => ({ api: { issues: { remove: apiMocks.remove } } }));
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

/** Última ação do toast com Undo. */
function undoAction() {
   const call = toastMock.mock.calls.at(-1)?.[1] as {
      action?: { label: string; onClick: () => void };
   };
   return call?.action;
}

describe('excluir issue com Undo (is#16)', () => {
   it('some da lista na hora e o DELETE só sai depois da janela de desfazer', async () => {
      act(() => void deleteIssuesWithUndo(['b']));
      expect(ids()).toEqual(['a', 'c']);
      expect(apiMocks.remove).not.toHaveBeenCalled();

      await act(async () => {
         vi.advanceTimersByTime(DELETE_UNDO_MS + 10);
      });
      expect(apiMocks.remove).toHaveBeenCalledWith('b');
   });

   it('Undo devolve a issue na posição e nunca chama o DELETE', async () => {
      act(() => void deleteIssuesWithUndo(['b']));
      expect(undoAction()?.label).toBe('Undo');
      act(() => undoAction()?.onClick());
      expect(ids()).toEqual(['a', 'b', 'c']);

      await act(async () => {
         vi.advanceTimersByTime(DELETE_UNDO_MS + 10);
      });
      expect(apiMocks.remove).not.toHaveBeenCalled();
   });

   it('removeRemote durante a janela invalida o Undo (outra aba já apagou)', async () => {
      act(() => void deleteIssuesWithUndo(['b']));
      expect(ids()).toEqual(['a', 'c']);

      act(() => useIssuesStore.getState().removeRemote('b'));
      act(() => undoAction()?.onClick());
      expect(ids()).toEqual(['a', 'c']); // não volta

      await act(async () => {
         vi.advanceTimersByTime(DELETE_UNDO_MS + 10);
      });
      expect(apiMocks.remove).not.toHaveBeenCalled(); // sem DELETE inútil (404)
   });

   it('DELETE que falha devolve a issue para a lista', async () => {
      apiMocks.remove.mockRejectedValueOnce(new Error('boom'));
      act(() => void deleteIssuesWithUndo(['b']));
      await act(async () => {
         vi.advanceTimersByTime(DELETE_UNDO_MS + 10);
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
         vi.advanceTimersByTime(DELETE_UNDO_MS + 10);
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
});
