// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/org/team/ENG/all';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { Sidebar, SidebarProvider, useSidebar } = await import('@/components/ui/sidebar');

function OpenButton() {
   const { setOpenMobile } = useSidebar();
   return <button onClick={() => setOpenMobile(true)}>abrir</button>;
}

function Shell() {
   return (
      <SidebarProvider>
         <Sidebar>
            <span>conteúdo da sidebar</span>
         </Sidebar>
         <OpenButton />
      </SidebarProvider>
   );
}

describe('sidebar em mobile/tablet (#56)', () => {
   beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
         matches: true,
         media: query,
         addEventListener: () => {},
         removeEventListener: () => {},
      }));
   });

   it('o sheet fecha ao navegar', () => {
      const { rerender } = render(<Shell />);
      act(() => screen.getByText('abrir').click());
      expect(screen.queryByText('conteúdo da sidebar')).not.toBeNull();

      pathname = '/org/inbox';
      rerender(<Shell />);
      expect(screen.queryByText('conteúdo da sidebar')).toBeNull();
   });

   it('breakpoint do CSS é o mesmo do useIsMobile (1024 = lg), sem md: no sidebar', () => {
      const src = readFileSync(join(process.cwd(), 'components/ui/sidebar.tsx'), 'utf8');
      const hook = readFileSync(join(process.cwd(), 'hooks/use-mobile.ts'), 'utf8');
      expect(hook).toContain('MOBILE_BREAKPOINT = 1024');
      expect(src).not.toMatch(/(^|[\s'"])md:/m);
      expect(src).toContain('hidden lg:block');
   });
});
