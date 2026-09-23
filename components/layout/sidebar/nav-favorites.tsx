'use client';

import {
   ArrowDown,
   ArrowUp,
   Box,
   CircleDot,
   Layers,
   LucideIcon,
   MoreVertical,
   Star,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuAction,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useFavoritesStore } from '@/store/favorites-store';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
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
   const toggle = useFavoritesStore((s) => s.toggle);
   const reorder = useFavoritesStore((s) => s.reorder);
   // Arraste nativo (co#16): a posicao ja existia no banco, mas nao havia como mudar.
   const [dragId, setDragId] = useState<string | null>(null);
   const [overId, setOverId] = useState<string | null>(null);
   // HTML5 drag não existe em touch: no mobile a reordenação degrada para um menu
   // "Move up"/"Move down" (mesmo breakpoint do `showOnHover` da estrela, lg).
   const isMobile = useIsMobile();

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
            {items.map((f, index) => {
               const Icon = ICON[f.entityType];
               const href = hrefFor(orgId, f);
               const active = pathname === href || pathname.startsWith(`${href}/`);
               return (
                  <SidebarMenuItem
                     key={f.id}
                     data-favorite-id={f.id}
                     data-drop={overId === f.id && dragId !== f.id ? 'true' : undefined}
                     draggable={!isMobile}
                     onDragStart={(event) => {
                        setDragId(f.id);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', f.id);
                     }}
                     onDragOver={(event) => {
                        if (!dragId || dragId === f.id) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setOverId(f.id);
                     }}
                     onDragLeave={() => setOverId((current) => (current === f.id ? null : current))}
                     onDrop={(event) => {
                        event.preventDefault();
                        const moved = dragId ?? event.dataTransfer.getData('text/plain');
                        setDragId(null);
                        setOverId(null);
                        if (moved && moved !== f.id) void reorder(moved, f.id);
                     }}
                     onDragEnd={() => {
                        setDragId(null);
                        setOverId(null);
                     }}
                     className={cn(
                        'relative',
                        dragId === f.id && 'opacity-50',
                        // Linha de insercao de 2 px onde o item cai.
                        overId === f.id &&
                           dragId !== f.id &&
                           'before:absolute before:-top-px before:left-0 before:right-0 before:h-0.5 before:rounded-full before:bg-primary'
                     )}
                  >
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
                     {isMobile ? (
                        // Sem drag em touch: reordenar degrada para um menu (co#16 + mobile).
                        <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                              <SidebarMenuAction aria-label={`${f.name} actions`}>
                                 <MoreVertical />
                              </SidebarMenuAction>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                 disabled={index === 0}
                                 onSelect={() => void reorder(f.id, items[index - 1].id)}
                              >
                                 <ArrowUp className="size-4" />
                                 Move up
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                 disabled={index === items.length - 1}
                                 onSelect={() => void reorder(items[index + 1].id, f.id)}
                              >
                                 <ArrowDown className="size-4" />
                                 Move down
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                 variant="destructive"
                                 onSelect={() => void toggle(f.entityType, f.entityId)}
                              >
                                 <Star className="size-4 fill-amber-400 text-amber-400" />
                                 Remove from favorites
                              </DropdownMenuItem>
                           </DropdownMenuContent>
                        </DropdownMenu>
                     ) : (
                        // Hover revela a estrela p/ desfavoritar (paridade Linear).
                        <SidebarMenuAction
                           showOnHover
                           aria-label="Remover dos favoritos"
                           onClick={() => void toggle(f.entityType, f.entityId)}
                        >
                           <Star className="fill-amber-400 text-amber-400" />
                        </SidebarMenuAction>
                     )}
                  </SidebarMenuItem>
               );
            })}
         </SidebarMenu>
      </SidebarGroup>
   );
}
