'use client';

import { useEffect } from 'react';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { deleteIssuesWithUndo } from './delete-with-undo';

/**
 * ⌘⌫ / Ctrl+⌫ exclui as issues selecionadas (ou a issue do contexto, na página do
 * detalhe) com janela de desfazer — o atalho era anunciado no menu sem handler (is#16).
 */
export function useIssueDeleteShortcut(contextIssueId?: string): void {
   useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
         if (e.key !== 'Backspace' && e.key !== 'Delete') return;
         if (!e.metaKey && !e.ctrlKey) return;
         const el = e.target as HTMLElement | null;
         if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '')) return;
         const selected = [...useBulkSelectionStore.getState().selected];
         const ids = selected.length > 0 ? selected : contextIssueId ? [contextIssueId] : [];
         if (ids.length === 0) return;
         e.preventDefault();
         deleteIssuesWithUndo(ids);
         if (selected.length > 0) useBulkSelectionStore.getState().clear();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
   }, [contextIssueId]);
}
