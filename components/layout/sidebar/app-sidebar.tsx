'use client';

import * as React from 'react';

import { NavInbox } from '@/components/layout/sidebar/nav-inbox';
import { NavFavorites } from '@/components/layout/sidebar/nav-favorites';
import { NavSearch } from '@/components/layout/sidebar/nav-search';
import { NavTeams } from '@/components/layout/sidebar/nav-teams';
import { NavWorkspace } from '@/components/layout/sidebar/nav-workspace';
import { NavSettings } from '@/components/layout/sidebar/nav-settings';
import { NavTeamsSettings } from '@/components/layout/sidebar/nav-teams-settings';
import { OrgSwitcher } from '@/components/layout/sidebar/org-switcher';
import { NavFooter } from '@/components/layout/sidebar/nav-footer';
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from '@/components/ui/sidebar';
import { usePathname } from 'next/navigation';
import { BackToApp } from '@/components/layout/sidebar/back-to-app';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
   const pathname = usePathname();
   const isSettings = pathname.includes('/settings');
   const orgId = pathname.split('/')[1] || 'nimbloo';
   return (
      <Sidebar collapsible="offcanvas" {...props}>
         <SidebarHeader>{isSettings ? <BackToApp orgId={orgId} /> : <OrgSwitcher />}</SidebarHeader>
         <SidebarContent>
            {isSettings ? (
               <>
                  <NavSettings />
                  <NavTeamsSettings />
               </>
            ) : (
               <>
                  <NavSearch />
                  <NavInbox />
                  <NavFavorites />
                  <NavWorkspace />
                  <NavTeams />
               </>
            )}
         </SidebarContent>
         {!isSettings && <NavFooter orgId={orgId} />}
         {/* Rail: borda clicável p/ recolher/expandir (aproxima do peek do Linear). */}
         <SidebarRail />
      </Sidebar>
   );
}
