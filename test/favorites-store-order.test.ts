import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FavoriteDto } from '@/lib/api/favorites';

const api = vi.hoisted(() => ({
   list: vi.fn(),
   add: vi.fn(async () => ({ added: true })),
   remove: vi.fn(async () => ({ removed: true })),
   reorder: vi.fn(async () => ({ ok: true })),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/client', () => ({ api: { favorites: api } }));
vi.mock('sonner', () => ({ toast }));

import { useFavoritesStore } from '@/store/favorites-store';

/** co#16 — reordenar otimista (com rollback) e falha de favoritar com aviso. */
const fav = (id: string, position: number): FavoriteDto => ({
   id,
   entityType: 'project',
   entityId: `e-${id}`,
   name: id.toUpperCase(),
   identifier: null,
   iconKey: null,
   position,
});

beforeEach(() => {
   vi.clearAllMocks();
   useFavoritesStore.setState({
      items: [fav('a', 0), fav('b', 1), fav('c', 2)],
      keys: new Set(['project:e-a', 'project:e-b', 'project:e-c']),
      loaded: true,
      loading: false,
      seq: 0,
   });
});

describe('favoritos — ordem', () => {
   it('move otimista e envia a ordem nova', async () => {
      const p = useFavoritesStore.getState().reorder('c', 'a');
      expect(useFavoritesStore.getState().items.map((f) => f.id)).toEqual(['c', 'a', 'b']);
      await p;
      expect(api.reorder).toHaveBeenCalledWith(['c', 'a', 'b']);
   });

   it('falha volta à ordem anterior e avisa', async () => {
      api.reorder.mockRejectedValueOnce(new Error('boom'));
      api.list.mockResolvedValueOnce([fav('a', 0), fav('b', 1), fav('c', 2)]);
      await useFavoritesStore.getState().reorder('c', 'a');
      expect(useFavoritesStore.getState().items.map((f) => f.id)).toEqual(['a', 'b', 'c']);
      expect(toast.error).toHaveBeenCalled();
   });

   it('favoritar que falha no servidor avisa (co#16)', async () => {
      api.add.mockRejectedValueOnce(new Error('boom'));
      api.list.mockResolvedValueOnce([fav('a', 0), fav('b', 1), fav('c', 2)]);
      await useFavoritesStore.getState().toggle('project', 'e-nova');
      expect(toast.error).toHaveBeenCalled();
      expect(useFavoritesStore.getState().isFavorite('project', 'e-nova')).toBe(false);
   });
});

describe('favoritos — falha dupla (mutação e recarga)', () => {
   it('favoritar que falha com a recarga também falhando apaga a estrela', async () => {
      api.add.mockRejectedValueOnce(new Error('offline'));
      api.list.mockRejectedValueOnce(new Error('offline'));
      await useFavoritesStore.getState().toggle('project', 'e-z');
      expect(toast.error).toHaveBeenCalled();
      expect(useFavoritesStore.getState().isFavorite('project', 'e-z')).toBe(false);
   });

   it('desfavoritar que falha com a recarga também falhando devolve a estrela', async () => {
      api.remove.mockRejectedValueOnce(new Error('offline'));
      api.list.mockRejectedValueOnce(new Error('offline'));
      await useFavoritesStore.getState().toggle('project', 'e-b');
      expect(toast.error).toHaveBeenCalled();
      expect(useFavoritesStore.getState().isFavorite('project', 'e-b')).toBe(true);
      expect(useFavoritesStore.getState().items.map((f) => f.id)).toEqual(['a', 'b', 'c']);
   });
});
