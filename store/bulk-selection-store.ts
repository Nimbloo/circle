import { create } from 'zustand';

interface BulkSelectionState {
   /** Ids das issues selecionadas para ações em lote. */
   selected: Set<string>;
   /** Último id clicado — âncora do Shift+clique. */
   anchorId: string | null;
   isSelected: (id: string) => boolean;
   toggle: (id: string) => void;
   /** Seleciona de `anchorId` (ou do próprio id) até `id` dentro da ordem visível. */
   selectRange: (orderedIds: readonly string[], id: string) => void;
   set: (ids: string[]) => void;
   clear: () => void;
   /** Mantém só os ids ainda visíveis (issue removida/escondida sai da seleção). */
   retain: (visibleIds: ReadonlySet<string>) => void;
}

/**
 * Seleção múltipla de issues (bulk actions). Vive fora dos dados das issues
 * (não persiste) — limpa ao trocar de view. A `BulkActionsBar` aplica as ações
 * sobre `selected` via o issues-store.
 */
export const useBulkSelectionStore = create<BulkSelectionState>((set, get) => ({
   selected: new Set<string>(),
   anchorId: null,
   isSelected: (id) => get().selected.has(id),
   toggle: (id) =>
      set((state) => {
         const next = new Set(state.selected);
         if (next.has(id)) next.delete(id);
         else next.add(id);
         return { selected: next, anchorId: id };
      }),
   selectRange: (orderedIds, id) =>
      set((state) => {
         const to = orderedIds.indexOf(id);
         const from = state.anchorId ? orderedIds.indexOf(state.anchorId) : -1;
         if (to < 0) return state;
         const [a, b] = from < 0 ? [to, to] : [Math.min(from, to), Math.max(from, to)];
         const next = new Set(state.selected);
         for (const rid of orderedIds.slice(a, b + 1)) next.add(rid);
         return { selected: next, anchorId: id };
      }),
   set: (ids) => set({ selected: new Set(ids), anchorId: ids.at(-1) ?? null }),
   clear: () =>
      set((state) =>
         state.selected.size ? { selected: new Set<string>(), anchorId: null } : state
      ),
   retain: (visibleIds) =>
      set((state) => {
         const kept = [...state.selected].filter((id) => visibleIds.has(id));
         return kept.length === state.selected.size ? state : { selected: new Set(kept) };
      }),
}));
