'use client';

import { useEffect, useRef } from 'react';
import type { Issue } from '@/data/issues';
import { hasOpenOverlay, isTypingTarget } from '@/lib/keyboard-guard';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { deleteIssuesWithUndo } from './delete-with-undo';

export interface IssueDeleteShortcutOptions {
   /** A issue do contexto, para excluir mesmo fora do store (deep-link frio). */
   contextIssue?: Issue | null;
   /** Chamado depois de excluir a issue do contexto (o detalhe sai da issue apagada). */
   onContextDeleted?: () => void;
}

/**
 * ⌘⌫ / Ctrl+⌫ exclui as issues selecionadas (ou a issue do contexto, na página do
 * detalhe) com janela de desfazer — o atalho era anunciado no menu sem handler (is#16).
 */
export function useIssueDeleteShortcut(
   contextIssueId?: string,
   options: IssueDeleteShortcutOptions = {}
): void {
   const optionsRef = useRef(options);
   useEffect(() => {
      optionsRef.current = options;
   });
   useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
         if (e.key !== 'Backspace' && e.key !== 'Delete') return;
         if (!e.metaKey && !e.ctrlKey) return;
         // Digitando, ou com dialog/menu aberto: o atalho não age sobre o que está por baixo.
         if (isTypingTarget(e.target) || hasOpenOverlay()) return;
         const selected = [...useBulkSelectionStore.getState().selected];
         const ids = selected.length > 0 ? selected : contextIssueId ? [contextIssueId] : [];
         if (ids.length === 0) return;
         e.preventDefault();
         const { contextIssue, onContextDeleted } = optionsRef.current;
         const deleted = deleteIssuesWithUndo(ids, { fallback: [contextIssue] });
         if (selected.length > 0) useBulkSelectionStore.getState().clear();
         else if (deleted) onContextDeleted?.();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
   }, [contextIssueId]);
}
