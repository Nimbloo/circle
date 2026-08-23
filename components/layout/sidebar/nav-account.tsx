'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { accountItems } from '@/data/side-bar-nav';

export function NavAccount() {
   const { orgId } = useParams<{ orgId: string }>();
   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarGroupLabel>Account</SidebarGroupLabel>
         <SidebarMenu>
            {accountItems.map((item) => (
               <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton asChild>
                     <Link href={`/${orgId}${item.url}`}>
                        <item.icon className="size-4" />
                        <span>{item.name}</span>
                     </Link>
                  </SidebarMenuButton>
               </SidebarMenuItem>
            ))}
         </SidebarMenu>
      </SidebarGroup>
   );
}
