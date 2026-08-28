'use client';

import Link from 'next/link';
import { HelpCircle, UserPlus } from 'lucide-react';
import {
   SidebarFooter,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';

/** Rodapé da sidebar (paridade Linear): Invite + Help, ancorados na base. */
export function NavFooter({ orgId }: { orgId: string }) {
   const openCommand = () => window.dispatchEvent(new CustomEvent('circle:open-command'));
   return (
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
         <SidebarMenu>
            <SidebarMenuItem>
               <SidebarMenuButton asChild size="sm">
                  <Link href={`/${orgId}/members`}>
                     <UserPlus className="text-muted-foreground" />
                     <span>Invite members</span>
                  </Link>
               </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
               <SidebarMenuButton size="sm" onClick={openCommand}>
                  <HelpCircle className="text-muted-foreground" />
                  <span>Help &amp; shortcuts</span>
               </SidebarMenuButton>
            </SidebarMenuItem>
         </SidebarMenu>
      </SidebarFooter>
   );
}
