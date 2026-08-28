import { create } from 'zustand';
import { api } from '@/lib/client';
import type { FavoriteDto, FavoriteEntityType } from '@/lib/api/favorites';

/**
 * Favoritos do usuário — server-backed (tabela `favorite`), cross-device.
 * Alimenta a seção "Favorites" da sidebar e a estrela de issue/project/view.
 * `keys` é o índice rápido p/ isFavorite; `items` guarda os DTOs resolvidos
 * (nome/ícone) p/ renderizar a lista.
 *
 * Toggle otimista: REMOVE dá splice local (não precisa de reload — já temos o DTO);
 * ADD precisa resolver nome/ícone, então recarrega a lista, mas com um `seq` monotônico
 * que descarta respostas obsoletas (clique rápido/duplo não desincroniza — BUG-5).
 */
const keyOf = (type: FavoriteEntityType, id: string) => `${type}:${id}`;
const keysOf = (items: FavoriteDto[]) => new Set(items.map((f) => keyOf(f.entityType, f.entityId)));

interface FavoritesState {
   items: FavoriteDto[];
   keys: Set<string>;
   loaded: boolean;
   loading: boolean;
   /** Contador monotônico de escritas; um reload só aplica se ainda for o mais recente. */
   seq: number;
   load: () => Promise<void>;
   isFavorite: (type: FavoriteEntityType, id: string) => boolean;
   toggle: (type: FavoriteEntityType, id: string) => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
   items: [],
   keys: new Set(),
   loaded: false,
   loading: false,
   seq: 0,

   load: async () => {
      if (get().loading) return; // dedup de montes concorrentes (BUG-6)
      set({ loading: true });
      try {
         const items = await api.favorites.list();
         set({ items, keys: keysOf(items), loaded: true });
      } catch {
         set({ loaded: true });
      } finally {
         set({ loading: false });
      }
   },

   isFavorite: (type, id) => get().keys.has(keyOf(type, id)),

   toggle: async (type, id) => {
      const k = keyOf(type, id);
      const wasFav = get().keys.has(k);
      const mySeq = get().seq + 1;
      set({ seq: mySeq });

      if (wasFav) {
         // Otimista + splice local: remove do índice E da lista sem roundtrip de leitura.
         const keys = new Set(get().keys);
         keys.delete(k);
         set({
            keys,
            items: get().items.filter((f) => !(f.entityType === type && f.entityId === id)),
         });
         try {
            await api.favorites.remove(type, id);
         } catch {
            // Reconcilia com o servidor só se a mutação falhou.
            const items = await api.favorites.list().catch(() => get().items);
            if (get().seq === mySeq) set({ items, keys: keysOf(items) });
         }
         return;
      }

      // ADD: otimista no índice; recarrega p/ resolver nome/ícone/ordem da nova entidade.
      const keys = new Set(get().keys);
      keys.add(k);
      set({ keys });
      try {
         await api.favorites.add(type, id);
      } catch {
         // segue pro reload, que reverte se o servidor não gravou
      }
      const items = await api.favorites.list().catch(() => null);
      // Só aplica se este ainda é o toggle mais recente (descarta resposta fora de ordem).
      if (items && get().seq === mySeq) set({ items, keys: keysOf(items) });
   },
}));
