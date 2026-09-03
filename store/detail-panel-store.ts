import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Páginas de detalhe que têm painel lateral de propriedades/atividade. */
export const DETAIL_PANEL_KINDS = ['initiative', 'project', 'issue', 'member'] as const;
export type DetailPanelKind = (typeof DETAIL_PANEL_KINDS)[number];

interface DetailPanelState {
   /** Painel aberto por tipo de página (persistido; padrão aberto, como no Linear). */
   openByKind: Record<DetailPanelKind, boolean>;
   setOpen: (kind: DetailPanelKind, open: boolean) => void;
   toggle: (kind: DetailPanelKind) => void;
   /** Aplica um snapshot vindo do servidor (user-settings-sync). */
   hydratePanels: (openByKind: Partial<Record<DetailPanelKind, boolean>>) => void;
}

export const DEFAULT_DETAIL_PANELS: Record<DetailPanelKind, boolean> = {
   initiative: true,
   project: true,
   issue: true,
   member: true,
};

/**
 * Um único estado de "painel lateral aberto" para initiative, project, issue e o perfil
 * de membro — substitui o `initiative-details-store` (só initiative) e o antigo
 * `'hidden'` do `right-panel-store` (project e perfil). Chaveado por tipo, não por id:
 * como no Linear, fechar o painel de um projeto fecha para todos os projetos.
 */
export const useDetailPanelStore = create<DetailPanelState>()(
   persist(
      (set) => ({
         openByKind: DEFAULT_DETAIL_PANELS,
         setOpen: (kind, open) =>
            set((state) =>
               state.openByKind[kind] === open
                  ? state
                  : { openByKind: { ...state.openByKind, [kind]: open } }
            ),
         toggle: (kind) =>
            set((state) => ({
               openByKind: { ...state.openByKind, [kind]: !state.openByKind[kind] },
            })),
         hydratePanels: (openByKind) =>
            set((state) => ({ openByKind: { ...state.openByKind, ...openByKind } })),
      }),
      { name: 'detail-panels', partialize: ({ openByKind }) => ({ openByKind }) }
   )
);
