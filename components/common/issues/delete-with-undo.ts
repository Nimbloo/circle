'use client';

import type { Issue } from '@/data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';

/**
 * Janela de desfazer (is#16). A issue sai da lista na hora e o DELETE só é enviado
 * quando a janela fecha — não exige rota de restore. Sair da página antes disso envia o
 * DELETE na hora (`pagehide`), para o toast nunca mentir.
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

   // Uma issue pode chegar apagada por OUTRA aba/servidor durante a janela (live-sync ->
   // removeRemote). Essas não voltam no Undo, nem levam um DELETE (404 inútil).
   const restorable = () =>
      removed.filter((i) => !useIssuesStore.getState().remoteDeletedIds.has(i.id));

   let settled = false;
   const pending: { timer?: ReturnType<typeof setTimeout> } = {};
   // Envia o DELETE de verdade. Falhou: a issue volta para a lista (o store já avisa o
   // erro; sem isto ela sumia da tela sem ter sido excluída).
   const commit = () => {
      if (settled) return;
      settled = true;
      clearTimeout(pending.timer);
      window.removeEventListener('pagehide', commit);
      for (const issue of restorable()) {
         void useIssuesStore
            .getState()
            .deleteIssue(issue.id)
            .catch(() => {
               // Rechecado na hora do rollback: a marca pode ter chegado com o DELETE em voo.
               if (!useIssuesStore.getState().remoteDeletedIds.has(issue.id)) restore([issue]);
            });
      }
   };
   pending.timer = setTimeout(commit, DELETE_UNDO_MS);
   // Saiu da página dentro da janela: exclui já, senão o "deleted" do toast seria mentira.
   window.addEventListener('pagehide', commit);

   toast(
      removed.length === 1
         ? `${removed[0].identifier} deleted`
         : `${removed.length} issues deleted`,
      {
         duration: DELETE_UNDO_MS,
         action: {
            label: 'Undo',
            onClick: () => {
               if (settled) return;
               settled = true;
               clearTimeout(pending.timer);
               window.removeEventListener('pagehide', commit);
               const stillGone = restorable();
               if (stillGone.length === 0) {
                  // O servidor já apagou (outra aba) antes do clique: nada a desfazer.
                  toast(removed.length === 1 ? 'Issue was deleted' : 'Issues were deleted');
                  return;
               }
               restore(stillGone);
            },
         },
      }
   );
}
