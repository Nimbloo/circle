import { create } from 'zustand';

/** Uma issue na ordem exibida pela última lista/board aberta. */
export interface IssueNavItem {
   id: string;
   identifier: string;
}

interface IssueNavigationState {
   /** Ordem VISÍVEL da lista de origem (grupos achatados, filtros e ordenação aplicados). */
   order: IssueNavItem[];
   setOrder: (order: IssueNavItem[]) => void;
}

/**
 * Lista de origem do detalhe (#33): anterior/próxima e J/K seguem a ordem que o usuário
 * via na lista/board de onde abriu a issue — não a ordem global do store. Persiste ao
 * sair da lista (o detalhe é outra rota); a próxima lista montada a substitui.
 */
export const useIssueNavigationStore = create<IssueNavigationState>((set) => ({
   order: [],
   setOrder: (order) =>
      set((state) =>
         state.order.length === order.length &&
         state.order.every(
            (item, i) => item.id === order[i].id && item.identifier === order[i].identifier
         )
            ? state
            : { order }
      ),
}));

/** Posição da issue na lista de origem e seus vizinhos; null se ela não está na lista. */
export function issueNeighbors(order: IssueNavItem[], identifier: string) {
   const index = order.findIndex((item) => item.identifier === identifier);
   if (index === -1) return null;
   return {
      index,
      total: order.length,
      prev: index > 0 ? order[index - 1] : undefined,
      next: index < order.length - 1 ? order[index + 1] : undefined,
   };
}

/** Tecla de navegação não vale: modificador, digitação ou diálogo/menu aberto. */
export function isKeyNavBlocked(e: KeyboardEvent): boolean {
   if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return true;
   const target = e.target as HTMLElement | null;
   if (
      target &&
      (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.tagName === 'SELECT' ||
         target.isContentEditable)
   )
      return true;
   return (
      typeof document !== 'undefined' && !!document.querySelector('[role="dialog"], [role="menu"]')
   );
}

/**
 * J/K (paridade Linear): `j` = próxima, `k` = anterior. Ignora digitação (input,
 * textarea, contenteditable), modificadores e quando há diálogo/menu aberto.
 */
export function navDirectionOf(e: KeyboardEvent): 1 | -1 | null {
   if (isKeyNavBlocked(e)) return null;
   const key = e.key.toLowerCase();
   return key === 'j' ? 1 : key === 'k' ? -1 : null;
}
