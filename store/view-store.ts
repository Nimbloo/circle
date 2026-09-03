import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useViewKey } from '@/lib/view-key';

export type ViewType = 'list' | 'grid';

export const DEFAULT_VIEW_TYPE: ViewType = 'list';

interface ViewTypeState {
   /** Layout (list/board) por view (chave de `lib/view-key.ts`). Ausente = lista. */
   viewTypeByView: Record<string, ViewType>;
   setViewType: (viewKey: string, viewType: ViewType) => void;
   /** Aplica o snapshot do servidor (user-settings-sync): substitui o mapa inteiro. */
   hydrateByView: (viewTypeByView: Record<string, ViewType>) => void;
}

function normalizeByView(byView: Record<string, unknown> | undefined | null) {
   const result: Record<string, ViewType> = {};
   if (!byView || typeof byView !== 'object') return result;
   for (const [viewKey, viewType] of Object.entries(byView)) {
      if (viewType === 'list' || viewType === 'grid') result[viewKey] = viewType;
   }
   return result;
}

/**
 * List/board POR VIEW (cada rota lembra o próprio layout, como no Linear).
 * Componentes usam `useViewStore()`, já ligado à view atual; o store cru é para o
 * user-settings-sync e testes.
 */
export const useViewTypeStore = create<ViewTypeState>()(
   persist(
      (set) => ({
         viewTypeByView: {},
         setViewType: (viewKey, viewType) =>
            set((state) =>
               state.viewTypeByView[viewKey] === viewType
                  ? state
                  : { viewTypeByView: { ...state.viewTypeByView, [viewKey]: viewType } }
            ),
         hydrateByView: (viewTypeByView) =>
            set({ viewTypeByView: normalizeByView(viewTypeByView) }),
      }),
      {
         name: 'view-storage',
         storage: createJSONStorage(() => localStorage),
         partialize: ({ viewTypeByView }) => ({ viewTypeByView }),
         version: 1,
         // v0 era um `viewType` global: descartado (volta pra lista em todas as views).
         migrate: (persisted, version) => {
            if (version < 1) return { viewTypeByView: {} };
            return persisted as Partial<ViewTypeState>;
         },
         merge: (persisted, current) => {
            const p = (persisted ?? {}) as Partial<ViewTypeState>;
            return { ...current, viewTypeByView: normalizeByView(p.viewTypeByView) };
         },
      }
   )
);

/** `{ viewType, setViewType }` da view atual — mesma API do antigo store global. */
export function useViewStore(): { viewType: ViewType; setViewType: (viewType: ViewType) => void } {
   const viewKey = useViewKey();
   const viewType = useViewTypeStore((s) => s.viewTypeByView[viewKey] ?? DEFAULT_VIEW_TYPE);
   const setViewType = useCallback(
      (next: ViewType) => useViewTypeStore.getState().setViewType(viewKey, next),
      [viewKey]
   );
   return { viewType, setViewType };
}
