'use client';

import type { Issue } from '@/data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';

/**
 * Janela de desfazer (is#16). A issue sai da lista na hora e o DELETE só é enviado
 * quando o toast fecha — não exige rota de restore. O commit segue o TOAST (o sonner
 * pausa o timer no hover e com a aba oculta): enquanto o Undo está visível, ele desfaz.
 * Sair da página antes disso envia o DELETE na hora (`pagehide`), para o toast nunca
 * mentir, e um teto de segurança garante o envio se o toast nunca fechar.
 */
export const DELETE_UNDO_MS = 6000;
/** Teto de segurança: toast preso (hover eterno, Toaster ausente) não segura o DELETE. */
export const DELETE_UNDO_CEILING_MS = 60_000;

function restore(issues: Issue[]): void {
   if (issues.length === 0) return;
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

export interface DeleteWithUndoOptions {
   /**
    * Issues conhecidas pelo chamador mas fora do store (deep-link frio, issue de outro time
    * antes do hydrate — a do `current-issue-store` no detalhe). Sem isto, excluir no
    * detalhe não fazia nada.
    */
   fallback?: readonly (Issue | null | undefined)[];
}

/**
 * Exclui issues com Undo: remoção otimista local, toast com "Undo" e o DELETE de
 * verdade (pelo store, com rollback em caso de erro) quando o toast fecha sozinho ou é
 * dispensado. Retorna `false` quando não havia nada a excluir.
 */
export function deleteIssuesWithUndo(
   ids: readonly string[],
   options: DeleteWithUndoOptions = {}
): boolean {
   const store = useIssuesStore.getState();
   const inStore = ids.map((id) => store.getIssueById(id)).filter((i): i is Issue => !!i);
   const inStoreIds = new Set(inStore.map((i) => i.id));
   const cold = ids
      .filter((id) => !inStoreIds.has(id))
      .map((id) => options.fallback?.find((i) => i?.id === id))
      .filter((i): i is Issue => !!i);
   const removed = [...inStore, ...cold];
   if (removed.length === 0) return false;
   useIssuesStore.setState((state) => ({
      issues: state.issues.filter((i) => !inStoreIds.has(i.id)),
   }));
   // Até o Undo ou o fim do DELETE, hidratações não trazem estas issues de volta.
   const { setPendingDelete } = useIssuesStore.getState();
   setPendingDelete(
      removed.map((i) => i.id),
      true
   );
   const release = (issues: readonly Issue[]) =>
      setPendingDelete(
         issues.map((i) => i.id),
         false
      );
   // Só volta para a lista quem estava nela: a issue fria não entra no store pelo Undo.
   const restoreListed = (issues: Issue[]) => restore(issues.filter((i) => inStoreIds.has(i.id)));

   // Uma issue pode chegar apagada por OUTRA aba/servidor durante a janela (live-sync ->
   // removeRemote). Essas não voltam no Undo, nem levam um DELETE (404 inútil).
   const restorable = () =>
      removed.filter((i) => !useIssuesStore.getState().remoteDeletedIds.has(i.id));

   let settled = false;
   let committed = false;
   const pending: { timer?: ReturnType<typeof setTimeout> } = {};
   const settle = () => {
      settled = true;
      clearTimeout(pending.timer);
      window.removeEventListener('pagehide', commit);
   };
   // Envia o DELETE de verdade. Falhou: a issue volta para a lista (o store já avisa o
   // erro; sem isto ela sumia da tela sem ter sido excluída).
   function commit() {
      if (settled) return;
      settle();
      committed = true;
      const toDelete = restorable();
      release(removed.filter((i) => !toDelete.includes(i)));
      for (const issue of toDelete) {
         void useIssuesStore
            .getState()
            .deleteIssue(issue.id)
            .then(
               () => release([issue]),
               () => {
                  release([issue]);
                  // Rechecado na hora do rollback: a marca pode ter chegado com o DELETE em voo.
                  if (!useIssuesStore.getState().remoteDeletedIds.has(issue.id))
                     restoreListed([issue]);
               }
            );
      }
   }
   pending.timer = setTimeout(commit, DELETE_UNDO_CEILING_MS);
   // Saiu da página dentro da janela: exclui já, senão o "deleted" do toast seria mentira.
   window.addEventListener('pagehide', commit);

   toast(
      removed.length === 1
         ? `${removed[0].identifier} deleted`
         : `${removed.length} issues deleted`,
      {
         duration: DELETE_UNDO_MS,
         onAutoClose: commit,
         onDismiss: commit,
         action: {
            label: 'Undo',
            onClick: () => {
               if (committed) {
                  // Clique tardio (o teto de segurança/pagehide já enviou o DELETE).
                  toast(
                     removed.length === 1 ? 'Issue já foi excluída' : 'Issues já foram excluídas'
                  );
                  return;
               }
               if (settled) return;
               settle();
               release(removed);
               const stillGone = restorable();
               if (stillGone.length === 0) {
                  // O servidor já apagou (outra aba) antes do clique: nada a desfazer.
                  toast(removed.length === 1 ? 'Issue was deleted' : 'Issues were deleted');
                  return;
               }
               restoreListed(stillGone);
               // Durante a janela o store ignorou os eventos destas issues (pendingDelete):
               // o snapshot pode estar velho — busca a versão atual de cada uma que voltou.
               const { applyRemote } = useIssuesStore.getState();
               for (const issue of stillGone)
                  if (inStoreIds.has(issue.id)) void applyRemote(issue.id);
            },
         },
      }
   );
   return true;
}
