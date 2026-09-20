// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { FavoriteDto } from '@/lib/api/favorites';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/inbox',
}));
vi.mock('@/lib/client', () => ({ api: { favorites: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { NavFavorites } from '@/components/layout/sidebar/nav-favorites';
import { useFavoritesStore } from '@/store/favorites-store';

/** co#16 — arrastar reordena os favoritos (a linha de inserção mostra onde cai). */
const fav = (id: string, name: string, position: number): FavoriteDto => ({
   id,
   entityType: 'project',
   entityId: `e-${id}`,
   name,
   identifier: null,
   iconKey: null,
   position,
});

const reorder = vi.fn(async () => {});

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
   }),
});

beforeEach(() => {
   vi.clearAllMocks();
   useFavoritesStore.setState({
      items: [fav('a', 'Alpha', 0), fav('b', 'Beta', 1), fav('c', 'Gama', 2)],
      keys: new Set(),
      loaded: true,
      loading: false,
      reorder,
   } as never);
});

const rowOf = (name: string) => screen.getByText(name).closest('[data-favorite-id]') as HTMLElement;

describe('favoritos na sidebar', () => {
   it('arrastar para outra linha reordena', () => {
      render(
         <SidebarProvider>
            <NavFavorites />
         </SidebarProvider>
      );
      const source = rowOf('Gama');
      const target = rowOf('Alpha');
      const data = new Map<string, string>();
      // O jsdom não implementa DataTransfer: um stub gravável no próprio evento.
      const dataTransfer = {
         setData: (k: string, v: string) => data.set(k, v),
         getData: (k: string) => data.get(k) ?? '',
         effectAllowed: '',
         dropEffect: '',
         setDragImage: () => {},
      };
      const drag = (type: 'dragStart' | 'dragOver' | 'drop', node: HTMLElement) => {
         const event = createEvent[type](node);
         Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
         fireEvent(node, event);
      };
      drag('dragStart', source);
      drag('dragOver', target);
      // Linha de inserção visível no alvo enquanto arrasta.
      expect(target.getAttribute('data-drop')).toBe('true');
      drag('drop', target);
      expect(reorder).toHaveBeenCalledWith('c', 'a');
      expect(target.getAttribute('data-drop')).toBeNull();
   });
});
