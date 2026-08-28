import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Entidades visitadas recentemente (client-side, localStorage). Alimenta o grupo
 * "Recently viewed" do ⌘K — atalho p/ voltar a issues/projects abertos há pouco.
 * Dedup por `${type}:${id}`, mais recente primeiro, cap em MAX.
 */
export type RecentType = 'issue' | 'project';

export interface RecentEntry {
   type: RecentType;
   id: string;
   label: string;
   /** Só issue: identifier (ENG-42) usado no href e no rótulo. */
   identifier?: string;
}

const MAX = 8;

interface RecentsState {
   recents: RecentEntry[];
   push: (entry: RecentEntry) => void;
   clear: () => void;
}

export const useRecentsStore = create<RecentsState>()(
   persist(
      (set) => ({
         recents: [],
         push: (entry) =>
            set((s) => {
               const key = `${entry.type}:${entry.id}`;
               const next = [entry, ...s.recents.filter((r) => `${r.type}:${r.id}` !== key)];
               return { recents: next.slice(0, MAX) };
            }),
         clear: () => set({ recents: [] }),
      }),
      { name: 'circle-recents' }
   )
);
