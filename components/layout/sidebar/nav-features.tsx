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
import { featuresItems } from '@/mock-data/side-bar-nav';

export function NavFeatures() {
   const { orgId } = useParams<{ orgId: string }>();
   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarGroupLabel>Features</SidebarGroupLabel>
         <SidebarMenu>
            {featuresItems.map((item) => (
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
