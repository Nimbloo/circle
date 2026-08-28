import { create } from 'zustand';
import { api } from '@/lib/client';
import type { FavoriteDto, FavoriteEntityType } from '@/lib/api/favorites';

/**
 * Favoritos do usuário — server-backed (tabela `favorite`), cross-device.
 * Alimenta a seção "Favorites" da sidebar e a estrela de issue/project/view.
 * `keys` é o índice rápido p/ isFavorite; `items` guarda os DTOs resolvidos
 * (nome/ícone) p/ renderizar a lista. Toggle é otimista com reload de `items`.
 */
const keyOf = (type: FavoriteEntityType, id: string) => `${type}:${id}`;

interface FavoritesState {
   items: FavoriteDto[];
   keys: Set<string>;
   loaded: boolean;
   load: () => Promise<void>;
   isFavorite: (type: FavoriteEntityType, id: string) => boolean;
   toggle: (type: FavoriteEntityType, id: string) => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
   items: [],
   keys: new Set(),
   loaded: false,

   load: async () => {
      try {
         const items = await api.favorites.list();
         set({
            items,
            keys: new Set(items.map((f) => keyOf(f.entityType, f.entityId))),
            loaded: true,
         });
      } catch {
         set({ loaded: true });
      }
   },

   isFavorite: (type, id) => get().keys.has(keyOf(type, id)),

   toggle: async (type, id) => {
      const k = keyOf(type, id);
      const wasFav = get().keys.has(k);
      // Otimista: atualiza o índice `keys` na hora (estrela responde instantâneo).
      const nextKeys = new Set(get().keys);
      if (wasFav) nextKeys.delete(k);
      else nextKeys.add(k);
      set({ keys: nextKeys });

      try {
         if (wasFav) await api.favorites.remove(type, id);
         else await api.favorites.add(type, id);
      } catch {
         // Ignora: o reload abaixo re-sincroniza com o servidor (fonte de verdade).
      }
      // Recarrega a lista p/ nome/ícone/ordem corretos na sidebar (e reverte se falhou).
      const items = await api.favorites.list().catch(() => get().items);
      set({ items, keys: new Set(items.map((f) => keyOf(f.entityType, f.entityId))) });
   },
}));
