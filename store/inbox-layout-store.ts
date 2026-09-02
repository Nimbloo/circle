import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_INBOX_LIST_WIDTH = 300;
export const MAX_INBOX_LIST_RATIO = 0.5;

export function clampInboxListWidth(width: number, availableWidth: number): number {
   const maximum = Math.max(DEFAULT_INBOX_LIST_WIDTH, availableWidth * MAX_INBOX_LIST_RATIO);
   return Math.min(Math.max(width, DEFAULT_INBOX_LIST_WIDTH), maximum);
}

interface InboxLayoutState {
   listWidth: number;
   setListWidth: (width: number) => void;
}

export const useInboxLayoutStore = create<InboxLayoutState>()(
   persist(
      (set) => ({
         listWidth: DEFAULT_INBOX_LIST_WIDTH,
         setListWidth: (listWidth) =>
            set((state) => (Math.abs(state.listWidth - listWidth) < 0.5 ? state : { listWidth })),
      }),
      {
         name: 'inbox-layout',
         partialize: ({ listWidth }) => ({ listWidth }),
      }
   )
);
