import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
vi.mock('@/lib/client', () => ({
   api: {
      favorites: {
         list: (...a: unknown[]) => list(...a),
         add: vi.fn(async () => ({ added: true })),
         remove: vi.fn(async () => ({ removed: true })),
      },
   },
}));

import { useFavoritesStore } from '@/store/favorites-store';
import { resolveRecents, useRecentsStore } from '@/store/recents-store';

/**
 * Co (baixas): recentes eram do NAVEGADOR (o próximo usuário da máquina via os do
 * anterior) e favoritos não reagiam a mudança feita em outra aba/dispositivo nem ao
 * rename da entidade favoritada.
 */

const fav = (entityType: 'issue' | 'project', entityId: string, name = entityId) => ({
   id: `f-${entityId}`,
   entityType,
   entityId,
   name,
   identifier: null,
   iconKey: null,
   position: 0,
});

beforeEach(() => {
   vi.clearAllMocks();
   useFavoritesStore.setState({
      items: [],
      keys: new Set(),
      loaded: false,
      loading: false,
      seq: 0,
   });
   useRecentsStore.setState({ byOwner: {} });
});

describe('recentes por org + usuário', () => {
   it('cada dono vê só os próprios recentes', () => {
      const s = useRecentsStore.getState();
      s.push('nimbloo:ana', { type: 'issue', id: 'i1', label: 'A', identifier: 'ENG-1' });
      s.push('nimbloo:bob', { type: 'project', id: 'p1', label: 'P' });
      const st = useRecentsStore.getState();
      expect(st.recentsOf('nimbloo:ana').map((r) => r.id)).toEqual(['i1']);
      expect(st.recentsOf('nimbloo:bob').map((r) => r.id)).toEqual(['p1']);
      expect(st.recentsOf('outra:ana')).toEqual([]);
   });

   it('rótulo vem da entidade viva; apagada some (depois que as issues carregaram)', () => {
      const entries = [
         { type: 'issue' as const, id: 'i1', label: 'Velho', identifier: 'ENG-1' },
         { type: 'issue' as const, id: 'i2', label: 'Apagada', identifier: 'ENG-2' },
         { type: 'project' as const, id: 'p1', label: 'Projeto velho' },
      ];
      const issues = [{ id: 'i1', title: 'Novo', identifier: 'ENG-9' }];
      const projects = [{ id: 'p1', name: 'Projeto novo' }];
      expect(resolveRecents(entries, issues, projects, true)).toEqual([
         { type: 'issue', id: 'i1', label: 'Novo', identifier: 'ENG-9' },
         { type: 'project', id: 'p1', label: 'Projeto novo' },
      ]);
      // Store ainda vazio: mantém o gravado em vez de sumir com tudo.
      expect(resolveRecents(entries, [], [], false)).toHaveLength(3);
   });
});

describe('favoritos reagem a eventos', () => {
   it('load em voo não sobrescreve um toggle feito depois dele', async () => {
      let resolve!: (v: unknown) => void;
      list.mockReturnValueOnce(new Promise((r) => (resolve = r)));
      const loading = useFavoritesStore.getState().load();
      list.mockResolvedValue([fav('project', 'p1')]);
      await useFavoritesStore.getState().toggle('project', 'p1');
      resolve([]); // resposta velha (antes do toggle)
      await loading;
      expect(useFavoritesStore.getState().isFavorite('project', 'p1')).toBe(true);
   });

   it('refresh: evento de outra aba recarrega mesmo com um load anterior já feito', async () => {
      list.mockResolvedValueOnce([]);
      await useFavoritesStore.getState().load();
      list.mockResolvedValueOnce([fav('issue', 'i1')]);
      await useFavoritesStore.getState().refresh();
      expect(useFavoritesStore.getState().isFavorite('issue', 'i1')).toBe(true);
   });

   it('rename/remoção de entidade favoritada recarrega; de outra entidade não', async () => {
      vi.useFakeTimers();
      try {
         list.mockResolvedValue([fav('issue', 'i1', 'Velho')]);
         await useFavoritesStore.getState().load();
         list.mockClear();
         useFavoritesStore.getState().onEntityChanged('issue', 'zzz');
         await vi.advanceTimersByTimeAsync(500);
         expect(list).not.toHaveBeenCalled();
         list.mockResolvedValue([fav('issue', 'i1', 'Novo')]);
         useFavoritesStore.getState().onEntityChanged('issue', 'i1');
         await vi.advanceTimersByTimeAsync(500);
         expect(list).toHaveBeenCalledTimes(1);
         expect(useFavoritesStore.getState().items[0].name).toBe('Novo');
      } finally {
         vi.useRealTimers();
      }
   });
});
