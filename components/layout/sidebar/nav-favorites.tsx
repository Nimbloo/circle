'use client';

import { Box, CircleDot, Layers, LucideIcon, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect } from 'react';

import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useFavoritesStore } from '@/store/favorites-store';
import type { FavoriteDto, FavoriteEntityType } from '@/lib/api/favorites';

const ICON: Record<FavoriteEntityType, LucideIcon> = {
   issue: CircleDot,
   project: Box,
   view: Layers,
};

function hrefFor(orgId: string, f: FavoriteDto): string {
   switch (f.entityType) {
      case 'issue':
         return `/${orgId}/issue/${f.identifier ?? f.entityId}`;
      case 'project':
         return `/${orgId}/project/${f.entityId}`;
      case 'view':
         return `/${orgId}/view/${f.entityId}`;
   }
}

export function NavFavorites() {
   const { orgId } = useParams<{ orgId: string }>();
   const pathname = usePathname();
   const items = useFavoritesStore((s) => s.items);
   const loaded = useFavoritesStore((s) => s.loaded);
   const load = useFavoritesStore((s) => s.load);

   useEffect(() => {
      if (!loaded) void load();
   }, [loaded, load]);

   if (items.length === 0) return null;

   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarGroupLabel>
            <Star className="size-3 mr-1.5 fill-amber-400 text-amber-400" />
            Favorites
         </SidebarGroupLabel>
         <SidebarMenu>
            {items.map((f) => {
               const Icon = ICON[f.entityType];
               const href = hrefFor(orgId, f);
               const active = pathname === href || pathname.startsWith(`${href}/`);
               return (
                  <SidebarMenuItem key={f.id}>
                     <SidebarMenuButton asChild isActive={active}>
                        <Link href={href}>
                           <Icon />
                           <span className="truncate">
                              {f.entityType === 'issue' && f.identifier && (
                                 <span className="text-muted-foreground mr-1.5">
                                    {f.identifier}
                                 </span>
                              )}
                              {f.name}
                           </span>
                        </Link>
                     </SidebarMenuButton>
                  </SidebarMenuItem>
               );
            })}
         </SidebarMenu>
      </SidebarGroup>
   );
}
