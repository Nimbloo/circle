'use client';

import { useEffect } from 'react';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';

/**
 * Esc limpa a seleção em lote (is#10) — no Linear é a saída natural do modo de seleção.
 * Ignora o Esc que fecha um popover/dialog (o Radix marca o evento como tratado) e o
 * que sai de um campo de texto.
 */
export function useBulkSelectionKeys(): void {
   useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
         if (e.key !== 'Escape' || e.defaultPrevented) return;
         const el = e.target as HTMLElement | null;
         if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '')) return;
         if (useBulkSelectionStore.getState().selected.size === 0) return;
         useBulkSelectionStore.getState().clear();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
   }, []);
}
