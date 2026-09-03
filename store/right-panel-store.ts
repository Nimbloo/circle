import { useMemo } from 'react';
import { create } from 'zustand';
import { useViewKey } from '@/lib/view-key';

/**
 * Right side panel shown on issues / cycle / project pages.
 * - 'insights': analytics panel (issue count by status, segmented by priority)
 * - 'cycle-details': current cycle summary (progress chart + breakdowns)
 * - 'breakdown': Labels/Priority/Projects/Teams counters (My issues)
 * Painéis de propriedades das páginas de detalhe (initiative/project/issue/member)
 * vivem no `detail-panel-store`, não aqui.
 */
export type RightPanelType = 'insights' | 'cycle-details' | 'breakdown' | 'initiatives-breakdown';

/** API pública, já escopada à rota atual (ver `useRightPanelStore`). */
export interface RightPanelState {
   openPanel: RightPanelType | null;

   togglePanel: (panel: RightPanelType) => void;
   openPanelOfType: (panel: RightPanelType) => void;
   closePanel: () => void;
}

interface RightPanelBaseState {
   /** Painel aberto por chave de view (`lib/view-key.ts`). Sem persistência. */
   byRoute: Record<string, RightPanelType | null>;

   setPanelAt: (route: string, panel: RightPanelType | null) => void;
   togglePanelAt: (route: string, panel: RightPanelType) => void;
}

/**
 * Store base, chaveado por rota: abrir o Insights em `team/ENG/all` não abre em
 * `my-issues` (como no Linear, cada view lembra o seu painel enquanto a sessão dura).
 * Componentes usam `useRightPanelStore`; o base fica exposto para testes e integrações.
 */
export const useRightPanelBaseStore = create<RightPanelBaseState>((set) => ({
   byRoute: {},

   setPanelAt: (route, panel) =>
      set((state) =>
         (state.byRoute[route] ?? null) === panel
            ? state
            : { byRoute: { ...state.byRoute, [route]: panel } }
      ),
   togglePanelAt: (route, panel) =>
      set((state) => ({
         byRoute: {
            ...state.byRoute,
            [route]: (state.byRoute[route] ?? null) === panel ? null : panel,
         },
      })),
}));

/**
 * Hook com a MESMA API do store antigo (`openPanel`, `togglePanel`, `openPanelOfType`,
 * `closePanel`), já escopado à view atual. O `selector` opcional recebe o objeto
 * escopado; as ações são memoizadas por rota, então `(s) => s.togglePanel` é estável.
 */
export function useRightPanelStore(): RightPanelState;
export function useRightPanelStore<T>(selector: (state: RightPanelState) => T): T;
export function useRightPanelStore<T>(selector?: (state: RightPanelState) => T) {
   const route = useViewKey();
   const openPanel = useRightPanelBaseStore((s) => s.byRoute[route] ?? null);

   const actions = useMemo(() => {
      const { setPanelAt, togglePanelAt } = useRightPanelBaseStore.getState();
      return {
         togglePanel: (panel: RightPanelType) => togglePanelAt(route, panel),
         openPanelOfType: (panel: RightPanelType) => setPanelAt(route, panel),
         closePanel: () => setPanelAt(route, null),
      };
   }, [route]);

   const scoped = useMemo<RightPanelState>(() => ({ openPanel, ...actions }), [openPanel, actions]);

   return selector ? selector(scoped) : scoped;
}
