import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface InitiativeDetailsState {
   open: boolean;
   toggle: () => void;
   setOpen: (open: boolean) => void;
}

export const useInitiativeDetailsStore = create<InitiativeDetailsState>()(
   persist(
      (set) => ({
         open: true,
         toggle: () => set((state) => ({ open: !state.open })),
         setOpen: (open) => set({ open }),
      }),
      {
         name: 'initiative-details',
         partialize: ({ open }) => ({ open }),
      }
   )
);
