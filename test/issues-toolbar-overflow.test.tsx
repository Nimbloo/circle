// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';

Object.defineProperty(window, 'matchMedia', {
   configurable: true,
   value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
   }),
});

/**
 * is#18: os toolbars de Issues e My issues estouravam a largura em telas ~390px
 * (tabs + ações não cabem lado a lado). Rolam horizontalmente em vez de quebrar
 * o layout da página.
 */

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', teamId: 'ENG' }),
   usePathname: () => '/nimbloo/team/ENG/all',
   useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/common/issues/issue-filter-trigger', () => ({
   IssueFilterTrigger: () => null,
}));
vi.mock('@/components/layout/headers/display-options', () => ({ DisplayOptions: () => null }));
vi.mock('@/components/layout/headers/issues/notifications', () => ({ default: () => null }));
vi.mock('@/lib/client', () => ({ api: { me: { activity: vi.fn(async () => []) } } }));
vi.mock('nuqs', () => ({
   parseAsStringLiteral: () => ({ withDefault: () => ({}) }),
   useQueryState: () => ['assigned', () => {}],
}));

describe('Toolbars do header rolam em vez de estourar (is#18)', () => {
   it('issues/header-options: view-bar tem overflow-x-auto', async () => {
      const { default: HeaderOptions } = await import(
         '@/components/layout/headers/issues/header-options'
      );
      const { container } = render(<HeaderOptions />);
      const viewBar = container.querySelector('[data-slot="view-bar"]');
      expect(viewBar?.classList.contains('overflow-x-auto')).toBe(true);
   });

   it('my-issues/header: view-bar tem overflow-x-auto', async () => {
      const { default: Header } = await import('@/components/layout/headers/my-issues/header');
      const { container } = render(
         <SidebarProvider>
            <Header />
         </SidebarProvider>
      );
      const viewBar = container.querySelector('[data-slot="view-bar"]');
      expect(viewBar?.classList.contains('overflow-x-auto')).toBe(true);
   });
});
