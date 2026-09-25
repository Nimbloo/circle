import { create } from 'zustand';
import { toast } from 'sonner';
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
   /** Recarrega sempre (evento `favorite` de outra aba/dispositivo do usuário). */
   refresh: () => Promise<void>;
   /**
    * Uma entidade mudou (rename/remoção): se é favorita, recarrega a lista (debounced)
    * para o nome/ícone da sidebar acompanhar. Evento de entidade não favorita é ignorado.
    */
   onEntityChanged: (type: FavoriteEntityType, id: string) => void;
   isFavorite: (type: FavoriteEntityType, id: string) => boolean;
   toggle: (type: FavoriteEntityType, id: string) => Promise<void>;
   /** Move o favorito `id` para a posicao do `beforeId` (arraste na sidebar). */
   reorder: (id: string, beforeId: string) => Promise<void>;
}

/** Token da leitura mais recente: só ela aplica (respostas fora de ordem são descartadas). */
let loadToken = 0;
let entityTimer: ReturnType<typeof setTimeout> | null = null;

export const useFavoritesStore = create<FavoritesState>()((set, get) => {
   /**
    * GET da lista. Aplica só se for a leitura mais nova E se nenhum toggle aconteceu
    * enquanto ela voava — senão uma resposta velha desfaria o toggle otimista.
    */
   const fetchList = async () => {
      const token = ++loadToken;
      const writeSeq = get().seq;
      const items = await api.favorites.list();
      if (token !== loadToken || get().seq !== writeSeq) return;
      set({ items, keys: keysOf(items), loaded: true });
   };

   return {
      items: [],
      keys: new Set(),
      loaded: false,
      loading: false,
      seq: 0,

      load: async () => {
         if (get().loading) return; // dedup de montes concorrentes (BUG-6)
         set({ loading: true });
         try {
            await fetchList();
         } catch {
            set({ loaded: true });
         } finally {
            set({ loading: false });
         }
      },

      refresh: async () => {
         try {
            await fetchList();
         } catch {
            // mantém a lista atual
         }
      },

      onEntityChanged: (type, id) => {
         if (!get().keys.has(keyOf(type, id))) return;
         if (entityTimer) clearTimeout(entityTimer);
         entityTimer = setTimeout(() => {
            entityTimer = null;
            void get().refresh();
         }, 300);
      },

      isFavorite: (type, id) => get().keys.has(keyOf(type, id)),

      reorder: async (id, beforeId) => {
         const previous = get().items;
         const from = previous.findIndex((f) => f.id === id);
         const to = previous.findIndex((f) => f.id === beforeId);
         if (from === -1 || to === -1 || from === to) return;
         const items = [...previous];
         const [moved] = items.splice(from, 1);
         items.splice(to, 0, moved);
         set({ items });
         try {
            await api.favorites.reorder(items.map((f) => f.id));
         } catch {
            // Reconcilia com o servidor (a ordem otimista nao vingou).
            const fresh = await api.favorites.list().catch(() => previous);
            set({ items: fresh, keys: keysOf(fresh) });
            toast.error('Falha ao reordenar os favoritos');
         }
      },

      toggle: async (type, id) => {
         const k = keyOf(type, id);
         const wasFav = get().keys.has(k);
         const mySeq = get().seq + 1;
         set({ seq: mySeq });

         if (wasFav) {
            // Otimista + splice local: remove do índice E da lista sem roundtrip de leitura.
            const before = get().items;
            // `keys` pode estar à frente de `items` (add em voo): o snapshot é o dos dois.
            const keysBefore = get().keys;
            const keys = new Set(keysBefore);
            keys.delete(k);
            set({
               keys,
               items: get().items.filter((f) => !(f.entityType === type && f.entityId === id)),
            });
            try {
               await api.favorites.remove(type, id);
            } catch {
               toast.error('Falha ao desfavoritar');
               // Reconcilia com o servidor só se a mutação falhou.
               // Sem a lista do servidor, o remove não vingou: volta ao estado anterior.
               const items = await api.favorites.list().catch(() => null);
               if (get().seq === mySeq)
                  set(items ? { items, keys: keysOf(items) } : { items: before, keys: keysBefore });
            }
            return;
         }

         // ADD: otimista no índice; recarrega p/ resolver nome/ícone/ordem da nova entidade.
         const keys = new Set(get().keys);
         keys.add(k);
         set({ keys });
         let failed = false;
         try {
            await api.favorites.add(type, id);
         } catch {
            // segue pro reload, que reverte se o servidor não gravou
            failed = true;
         }
         // Falha silenciosa (co#16): a estrela voltava sozinha, sem explicar.
         if (failed) toast.error('Falha ao favoritar');
         const items = await api.favorites.list().catch(() => null);
         // Só aplica se este ainda é o toggle mais recente (descarta resposta fora de ordem).
         if (items && get().seq === mySeq) set({ items, keys: keysOf(items) });
         else if (!items && failed && get().seq === mySeq) {
            // Add falhou e a recarga também: a estrela otimista não pode ficar acesa.
            const back = new Set(get().keys);
            back.delete(k);
            set({ keys: back });
         }
      },
   };
});
