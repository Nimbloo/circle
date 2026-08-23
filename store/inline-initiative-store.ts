import { create } from 'zustand';

/**
 * Estado da criação INLINE de initiative (padrão Linear): o botão "New initiative"
 * no header liga `creating`, e a lista renderiza a linha editável no topo — sem modal.
 */
interface InlineInitiativeState {
   creating: boolean;
   start: () => void;
   stop: () => void;
}

export const useInlineInitiativeStore = create<InlineInitiativeState>((set) => ({
   creating: false,
   start: () => set({ creating: true }),
   stop: () => set({ creating: false }),
}));
