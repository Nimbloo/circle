import { create } from 'zustand';

interface BulkSelectionState {
   /** Ids das issues selecionadas para ações em lote. */
   selected: Set<string>;
   isSelected: (id: string) => boolean;
   toggle: (id: string) => void;
   set: (ids: string[]) => void;
   clear: () => void;
}

/**
 * Seleção múltipla de issues (bulk actions). Vive fora dos dados das issues
 * (não persiste) — limpa ao trocar de view. A `BulkActionsBar` aplica as ações
 * sobre `selected` via o issues-store.
 */
export const useBulkSelectionStore = create<BulkSelectionState>((set, get) => ({
   selected: new Set<string>(),
   isSelected: (id) => get().selected.has(id),
   toggle: (id) =>
      set((state) => {
         const next = new Set(state.selected);
         if (next.has(id)) next.delete(id);
         else next.add(id);
         return { selected: next };
      }),
   set: (ids) => set({ selected: new Set(ids) }),
   clear: () => set((state) => (state.selected.size ? { selected: new Set<string>() } : state)),
}));
