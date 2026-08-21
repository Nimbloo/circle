'use client';

import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuPortal,
   DropdownMenuSeparator,
   DropdownMenuShortcut,
   DropdownMenuSub,
   DropdownMenuSubContent,
   DropdownMenuSubTrigger,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { NimblooLogo } from '@/components/brand/nimbloo-logo';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CreateNewIssue } from './create-new-issue';
import { ThemeToggle } from '../theme-toggle';

export function OrgSwitcher() {
   const { orgId } = useParams<{ orgId: string }>();
   const org = orgId ?? 'nimbloo';
   const me = useWorkspaceStore((s) => s.me);
   const name = me?.name ?? 'Você';
   const email = me?.email ?? '';

   return (
      <SidebarMenu>
         <SidebarMenuItem>
            <DropdownMenu>
               <div className="w-full flex gap-1 items-center pt-2">
                  <DropdownMenuTrigger asChild>
                     <SidebarMenuButton
                        size="lg"
                        className="h-8 p-1 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                     >
                        {/* Identidade = usuário LOGADO (dinâmico do `me`), não o workspace. */}
                        <Avatar className="size-6 rounded-md">
                           <AvatarImage src={me?.avatarUrl ?? undefined} alt={name} />
                           <AvatarFallback className="rounded-md text-xs">
                              {name.charAt(0).toUpperCase()}
                           </AvatarFallback>
                        </Avatar>
                        <span className="grid flex-1 text-left text-sm leading-tight truncate font-medium">
                           {name}
                        </span>
                        <ChevronsUpDown className="ml-auto" />
                     </SidebarMenuButton>
                  </DropdownMenuTrigger>

                  <ThemeToggle />

                  <CreateNewIssue />
               </div>
               <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-60 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
               >
                  <DropdownMenuLabel className="truncate font-normal">
                     <div className="font-medium">{name}</div>
                     {email && (
                        <div className="text-muted-foreground text-xs truncate">{email}</div>
                     )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                     <DropdownMenuItem asChild>
                        <Link href={`/${org}/settings`}>
                           Settings
                           <DropdownMenuShortcut>G then S</DropdownMenuShortcut>
                        </Link>
                     </DropdownMenuItem>
                     <DropdownMenuItem asChild>
                        <Link href={`/${org}/members`}>Invite and manage members</Link>
                     </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                     <DropdownMenuSubTrigger>Workspace</DropdownMenuSubTrigger>
                     <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                           <DropdownMenuLabel className="text-muted-foreground text-xs">
                              {email}
                           </DropdownMenuLabel>
                           <DropdownMenuSeparator />
                           <DropdownMenuItem asChild>
                              <Link href={`/${org}`}>
                                 <NimblooLogo size={20} />
                              </Link>
                           </DropdownMenuItem>
                        </DropdownMenuSubContent>
                     </DropdownMenuPortal>
                  </DropdownMenuSub>
                  <DropdownMenuItem onSelect={() => signOut({ callbackUrl: '/login' })}>
                     Log out
                     <DropdownMenuShortcut>⌥⇧Q</DropdownMenuShortcut>
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </SidebarMenuItem>
      </SidebarMenu>
   );
}
