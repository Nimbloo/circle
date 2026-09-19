// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchReviews = vi.fn();
vi.mock('@/lib/adapters-reviews', () => ({
   fetchReviews: (...args: unknown[]) => fetchReviews(...args),
}));
vi.mock('@/lib/client', () => ({ api: {} }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/inbox',
}));

import { NavInbox } from '@/components/layout/sidebar/nav-inbox';
import { SidebarProvider } from '@/components/ui/sidebar';
import { REVIEW_CHANGED_EVENT } from '@/lib/use-live-sync';

beforeEach(() => {
   fetchReviews.mockReset();
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
});

/** Baixa Co: o badge de Reviews contava TODOS os PRs e nunca atualizava. */
describe('nav: contagem de reviews pendentes', () => {
   it('conta só os abertos pedidos a mim e atualiza com o evento de review', async () => {
      fetchReviews.mockResolvedValueOnce({ reviews: [], total: 3, limit: 1, offset: 0 });
      render(
         <SidebarProvider>
            <NavInbox />
         </SidebarProvider>
      );
      await screen.findByText('3');
      expect(fetchReviews.mock.calls[0][0]).toMatchObject({
         list: 'for-you',
         statuses: ['open'],
      });

      fetchReviews.mockResolvedValueOnce({ reviews: [], total: 2, limit: 1, offset: 0 });
      act(() => {
         window.dispatchEvent(new CustomEvent(REVIEW_CHANGED_EVENT, { detail: { id: 'x/y#1' } }));
      });
      await waitFor(() => expect(screen.getByText('2')).toBeTruthy(), { timeout: 3000 });
   });
});
