'use client';

import type { Issue } from '@/data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';

/**
 * Janela de desfazer (is#16). A issue sai da lista na hora e o DELETE só é enviado
 * quando a janela fecha — é o caminho do Linear e não exige rota de restore. Fechar a
 * aba antes disso simplesmente não exclui: nada é perdido.
 */
export const DELETE_UNDO_MS = 6000;

function restore(issues: Issue[]): void {
   useIssuesStore.setState((state) => {
      const missing = issues.filter((i) => !state.issues.some((cur) => cur.id === i.id));
      if (missing.length === 0) return state;
      return {
         issues: [...state.issues, ...missing].sort((a, b) =>
            a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0
         ),
      };
   });
}

/**
 * Exclui issues com Undo: remoção otimista local, toast com "Undo" e o DELETE de
 * verdade (pelo store, com rollback em caso de erro) depois de `DELETE_UNDO_MS`.
 */
export function deleteIssuesWithUndo(ids: readonly string[]): void {
   const store = useIssuesStore.getState();
   const removed = ids.map((id) => store.getIssueById(id)).filter((i): i is Issue => !!i);
   if (removed.length === 0) return;
   const removedIds = new Set(removed.map((i) => i.id));
   useIssuesStore.setState((state) => ({
      issues: state.issues.filter((i) => !removedIds.has(i.id)),
   }));

   let undone = false;
   const timer = setTimeout(() => {
      if (undone) return;
      for (const id of removedIds) {
         // O store marca a mutação como própria, faz o DELETE e reverte no erro.
         void useIssuesStore
            .getState()
            .deleteIssue(id)
            .catch(() => undefined);
      }
   }, DELETE_UNDO_MS);

   toast(
      removed.length === 1 ? `${removed[0].identifier} deleted` : `${removed.length} issues deleted`,
      {
         action: {
            label: 'Undo',
            onClick: () => {
               undone = true;
               clearTimeout(timer);
               restore(removed);
            },
         },
      }
   );
}
