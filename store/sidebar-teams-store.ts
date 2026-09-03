import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarTeamsState {
   /** Times expandidos na sidebar, por id. Ausente = ainda não decidido pelo usuário. */
   openById: Record<string, boolean>;
   setOpen: (teamId: string, open: boolean) => void;
   /** Aplica o snapshot do servidor (user-settings-sync): substitui o mapa inteiro. */
   hydrateOpenById: (openById: Record<string, boolean>) => void;
}

/**
 * Estado de expandido/recolhido de cada time na sidebar (paridade Linear: lembra por
 * time entre sessões). O default para um time nunca tocado é decidido pelo componente.
 */
export const useSidebarTeamsStore = create<SidebarTeamsState>()(
   persist(
      (set) => ({
         openById: {},
         setOpen: (teamId, open) =>
            set((state) =>
               state.openById[teamId] === open
                  ? state
                  : { openById: { ...state.openById, [teamId]: open } }
            ),
         hydrateOpenById: (openById) => {
            const clean: Record<string, boolean> = {};
            Object.entries(openById ?? {}).forEach(([teamId, open]) => {
               if (typeof open === 'boolean') clean[teamId] = open;
            });
            set({ openById: clean });
         },
      }),
      { name: 'sidebar-teams', partialize: ({ openById }) => ({ openById }) }
   )
);

/** Aberto se o usuário já decidiu; senão, só o primeiro time começa expandido. */
export function isTeamOpen(openById: Record<string, boolean>, teamId: string, index: number) {
   return openById[teamId] ?? index === 0;
}
