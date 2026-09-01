'use client';

import * as React from 'react';
import { ChevronsUpDown, Search } from 'lucide-react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuShortcut,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { NimblooLogo } from '@/components/brand/nimbloo-logo';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CreateNewIssue } from './create-new-issue';
import { ThemeToggle } from '../theme-toggle';
import { Button } from '@/components/ui/button';

export function OrgSwitcher() {
   const { orgId } = useParams<{ orgId: string }>();
   const org = orgId ?? 'nimbloo';
   // Nome do workspace (paridade Linear: o topo é o WORKSPACE, não a conta).
   const workspaceName = org.charAt(0).toUpperCase() + org.slice(1);
   const me = useWorkspaceStore((s) => s.me);
   const name = me?.name ?? 'Você';
   const email = me?.email ?? '';

   return (
      <SidebarMenu>
         <SidebarMenuItem>
            <DropdownMenu>
               <div className="flex w-full items-center gap-1">
                  <DropdownMenuTrigger asChild>
                     <SidebarMenuButton
                        size="lg"
                        className="h-7 min-w-0 flex-1 px-1 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                     >
                        {/* Identidade = WORKSPACE (logo + nome), como no Linear. A conta
                            do usuário vive no dropdown abaixo. */}
                        <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-sidebar-accent">
                           <NimblooLogo size={14} />
                        </div>
                        <span className="grid flex-1 truncate text-left text-[13px] font-medium leading-tight">
                           {workspaceName}
                        </span>
                        <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" />
                     </SidebarMenuButton>
                  </DropdownMenuTrigger>

                  <Button
                     variant="ghost"
                     size="icon"
                     className="size-7 shrink-0"
                     aria-label="Search workspace"
                     onClick={() => window.dispatchEvent(new CustomEvent('circle:open-command'))}
                  >
                     <Search className="size-3.5" />
                  </Button>

                  <CreateNewIssue />
               </div>
               <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-60 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
               >
                  {/* Conta do usuário logado (avatar + nome + email). */}
                  <DropdownMenuLabel className="flex items-center gap-2 font-normal">
                     <Avatar className="size-7 rounded-md">
                        <AvatarImage src={me?.avatarUrl ?? undefined} alt={name} />
                        <AvatarFallback delayMs={500} className="rounded-md text-xs">
                           {name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                     </Avatar>
                     <div className="min-w-0">
                        <div className="font-medium truncate">{name}</div>
                        {email && (
                           <div className="text-muted-foreground text-xs truncate">{email}</div>
                        )}
                     </div>
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
                  <div className="flex items-center justify-between px-2 py-1 text-sm">
                     <span>Theme</span>
                     <ThemeToggle />
                  </div>
                  <DropdownMenuSeparator />
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
