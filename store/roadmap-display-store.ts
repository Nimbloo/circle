import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TimelineZoom } from '@/lib/timeline-scale';

/* Opções de display do Roadmap (#102), no padrão do `projects-display-store`. */

export type RoadmapOrdering = 'start-date' | 'target-date' | 'title';

interface RoadmapDisplayState {
   /** Escala da régua (Year / Quarter / Month / Week). */
   zoom: TimelineZoom;
   /** Mostra projetos concluídos/cancelados. */
   showCompleted: boolean;
   /** Desenha as setas de dependência entre as barras. */
   showDependencies: boolean;
   /** Mostra os marcos (losangos) sobre as barras. */
   showMilestones: boolean;
   /** Coluna fixa com a lista de projetos à esquerda. */
   showProjectList: boolean;
   ordering: RoadmapOrdering;

   setZoom: (zoom: TimelineZoom) => void;
   setShowCompleted: (value: boolean) => void;
   setShowDependencies: (value: boolean) => void;
   setShowMilestones: (value: boolean) => void;
   setShowProjectList: (value: boolean) => void;
   setOrdering: (ordering: RoadmapOrdering) => void;
   resetRoadmapDisplay: () => void;
}

export const ROADMAP_DISPLAY_DEFAULTS = {
   zoom: 'quarter' as TimelineZoom,
   showCompleted: true,
   showDependencies: true,
   showMilestones: true,
   showProjectList: true,
   ordering: 'start-date' as RoadmapOrdering,
};

export const useRoadmapDisplayStore = create<RoadmapDisplayState>()(
   persist(
      (set) => ({
         ...ROADMAP_DISPLAY_DEFAULTS,

         setZoom: (zoom) => set({ zoom }),
         setShowCompleted: (showCompleted) => set({ showCompleted }),
         setShowDependencies: (showDependencies) => set({ showDependencies }),
         setShowMilestones: (showMilestones) => set({ showMilestones }),
         setShowProjectList: (showProjectList) => set({ showProjectList }),
         setOrdering: (ordering) => set({ ordering }),
         resetRoadmapDisplay: () => set({ ...ROADMAP_DISPLAY_DEFAULTS }),
      }),
      {
         name: 'roadmap-display-settings-v1',
         storage: createJSONStorage(() => localStorage),
      }
   )
);
