import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Views favoritadas pelo usuário (client-side, persistido em localStorage).
 * Alimenta a estrela do header da view e a ordenação "favoritas primeiro" na lista.
 * (Pode migrar para user_settings/servidor depois, como as outras prefs.)
 */
interface ViewFavoritesState {
   favoriteIds: string[];
   isFavorite: (id: string) => boolean;
   toggle: (id: string) => void;
}

export const useViewFavoritesStore = create<ViewFavoritesState>()(
   persist(
      (set, get) => ({
         favoriteIds: [],
         isFavorite: (id) => get().favoriteIds.includes(id),
         toggle: (id) =>
            set((s) => ({
               favoriteIds: s.favoriteIds.includes(id)
                  ? s.favoriteIds.filter((x) => x !== id)
                  : [...s.favoriteIds, id],
            })),
      }),
      { name: 'view-favorites' }
   )
);
