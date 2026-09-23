// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** 390px (sem drag em touch): reordenar degrada para setas/menu (co#16 + mobile). */
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

beforeAll(() => {
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
   Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => 390 });
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

describe('favoritos na sidebar — mobile (390px)', () => {
   it('a linha não é mais draggable (sem drag nativo em touch)', () => {
      render(
         <SidebarProvider>
            <NavFavorites />
         </SidebarProvider>
      );
      expect(rowOf('Beta').getAttribute('draggable')).toBe('false');
   });

   it('menu "…" com Move up/down substitui a estrela sempre visível', async () => {
      const user = userEvent.setup();
      render(
         <SidebarProvider>
            <NavFavorites />
         </SidebarProvider>
      );
      await user.click(screen.getByLabelText('Beta actions'));
      await user.click(await screen.findByText('Move down'));
      expect(reorder).toHaveBeenCalledWith('c', 'b');
   });

   it('"Move up" no primeiro item fica desabilitado', async () => {
      const user = userEvent.setup();
      render(
         <SidebarProvider>
            <NavFavorites />
         </SidebarProvider>
      );
      await user.click(screen.getByLabelText('Alpha actions'));
      const moveUp = await screen.findByText('Move up');
      expect(moveUp.closest('[role="menuitem"]')?.getAttribute('data-disabled')).not.toBeNull();
   });
});
