'use client';

import {
   Archive,
   Bell,
   Box,
   ChevronRight,
   CopyMinus,
   Home,
   Inbox,
   Layers,
   Link as LinkIcon,
   MoreHorizontal,
   Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
   SidebarMenuSub,
   SidebarMenuSubButton,
   SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';

/** Sub-item de time com href resolvido pelo orgId real e realce de rota ativa. */
function TeamSub({ href, children }: { href: string; children: ReactNode }) {
   const pathname = usePathname();
   const active = pathname === href || pathname.startsWith(`${href}/`);
   return (
      <SidebarMenuSubButton asChild isActive={active}>
         <Link href={href}>{children}</Link>
      </SidebarMenuSubButton>
   );
}

export function NavTeams() {
   const { orgId } = useParams<{ orgId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const joinedTeams = teams.filter((t) => t.joined);
   return (
      <SidebarGroup>
         <SidebarGroupLabel>Your teams</SidebarGroupLabel>
         <SidebarMenu>
            {joinedTeams.map((item, index) => (
               <Collapsible
                  key={item.name}
                  asChild
                  defaultOpen={index === 0}
                  className="group/collapsible"
               >
                  <SidebarMenuItem>
                     <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={item.name}>
                           {/* Avatar de time colorido pela cor do time (paridade Linear),
                               com o ícone/emoji ou a inicial do nome. */}
                           <div
                              className="inline-flex size-6 items-center justify-center rounded shrink-0 text-xs font-medium text-white"
                              style={{ backgroundColor: item.color }}
                           >
                              {item.icon || item.name.charAt(0).toUpperCase()}
                           </div>
                           <span className="text-sm">{item.name}</span>
                           <span className="w-3 shrink-0">
                              <ChevronRight className="w-full transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                           </span>
                           <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                 <SidebarMenuAction asChild showOnHover>
                                    <div>
                                       <MoreHorizontal />
                                       <span className="sr-only">More</span>
                                    </div>
                                 </SidebarMenuAction>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                 className="w-48 rounded-lg"
                                 side="right"
                                 align="start"
                              >
                                 <DropdownMenuItem>
                                    <Settings className="size-4" />
                                    <span>Team settings</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuItem>
                                    <LinkIcon className="size-4" />
                                    <span>Copy link</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuItem>
                                    <Archive className="size-4" />
                                    <span>Open archive</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                 <DropdownMenuItem>
                                    <Bell className="size-4" />
                                    <span>Subscribe</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                 <DropdownMenuItem>
                                    <span>Leave team...</span>
                                 </DropdownMenuItem>
                              </DropdownMenuContent>
                           </DropdownMenu>
                        </SidebarMenuButton>
                     </CollapsibleTrigger>
                     <CollapsibleContent>
                        <SidebarMenuSub>
                           <SidebarMenuSubItem>
                              <TeamSub href={`/${orgId}/team/${item.id}/overview`}>
                                 <Home size={14} />
                                 <span>Home</span>
                              </TeamSub>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <TeamSub href={`/${orgId}/team/${item.id}/all`}>
                                 <CopyMinus size={14} />
                                 <span>Issues</span>
                              </TeamSub>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <TeamSub href={`/${orgId}/team/${item.id}/triage`}>
                                 <Inbox size={14} />
                                 <span>Triage</span>
                              </TeamSub>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <TeamSub href={`/${orgId}/team/${item.id}/cycles`}>
                                 <CyclePlayIcon className="size-3.5" />
                                 <span>Cycles</span>
                              </TeamSub>
                              <SidebarMenuSub className="mr-0 pr-0">
                                 <SidebarMenuSubItem>
                                    <TeamSub href={`/${orgId}/team/${item.id}/cycle/active`}>
                                       <span>Current</span>
                                    </TeamSub>
                                 </SidebarMenuSubItem>
                                 <SidebarMenuSubItem>
                                    <TeamSub href={`/${orgId}/team/${item.id}/cycle/upcoming`}>
                                       <span>Upcoming</span>
                                    </TeamSub>
                                 </SidebarMenuSubItem>
                              </SidebarMenuSub>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <TeamSub href={`/${orgId}/team/${item.id}/projects`}>
                                 <Box size={14} />
                                 <span>Projects</span>
                              </TeamSub>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <TeamSub href={`/${orgId}/team/${item.id}/views`}>
                                 <Layers size={14} />
                                 <span>Views</span>
                              </TeamSub>
                           </SidebarMenuSubItem>
                        </SidebarMenuSub>
                     </CollapsibleContent>
                  </SidebarMenuItem>
               </Collapsible>
            ))}
         </SidebarMenu>
      </SidebarGroup>
   );
}
