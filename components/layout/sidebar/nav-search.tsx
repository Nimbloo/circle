'use client';

import {
   SidebarGroup,
   SidebarMenu,
   SidebarMenuBadge,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Item "Search" da sidebar: abre o command palette (⌘K / Ctrl+K) via CustomEvent
 * `circle:open-command` (o mesmo palette que responde ao atalho de teclado). Mostra
 * o badge do atalho, detectando Mac (⌘) vs outros (Ctrl).
 */
export function NavSearch() {
   const [isMac, setIsMac] = useState(true);
   useEffect(() => {
      const platform =
         (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
            ?.platform ||
         navigator.platform ||
         '';
      setIsMac(/mac/i.test(platform));
   }, []);

   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarMenu>
            <SidebarMenuItem>
               <SidebarMenuButton
                  onClick={() => window.dispatchEvent(new CustomEvent('circle:open-command'))}
                  aria-label="Search (open command palette)"
               >
                  <Search />
                  <span>Search</span>
               </SidebarMenuButton>
               <SidebarMenuBadge className="text-muted-foreground pointer-events-none font-mono text-[10px]">
                  {isMac ? '⌘K' : 'Ctrl K'}
               </SidebarMenuBadge>
            </SidebarMenuItem>
         </SidebarMenu>
      </SidebarGroup>
   );
}
