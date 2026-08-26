'use client';

import { Box, ChevronRight, CopyMinus, Home, Layers, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState } from 'react';

import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuShortcut,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
   SidebarMenu,
   SidebarMenuAction,
   SidebarMenuButton,
   SidebarMenuItem,
   SidebarMenuSub,
   SidebarMenuSubButton,
   SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { CollapsibleSidebarGroup } from './collapsible-sidebar-group';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Team } from '@/data/teams';
import { TeamMenuItems, useTeamDelete } from '@/components/common/teams/team-menu-items';
import { RiDonutChartFill } from '@remixicon/react';

function TeamNavItem({ team, defaultOpen }: { team: Team; defaultOpen: boolean }) {
   const { orgId } = useParams<{ orgId: string }>();
   const pathname = usePathname();
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const doDelete = useTeamDelete(team, () => setConfirmOpen(false));

   const base = `/${orgId}/team/${team.id}`;
   const remove = async () => {
      if (busy) return;
      setBusy(true);
      await doDelete();
      setBusy(false);
   };

   return (
      <>
         <Collapsible asChild defaultOpen={defaultOpen} className="group/collapsible">
            <SidebarMenuItem>
               <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={team.name}>
                     <div className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0 text-xs">
                        {team.icon}
                     </div>
                     <span className="truncate">{team.name}</span>
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
                        <DropdownMenuContent className="w-52 rounded-lg" side="right" align="start">
                           <TeamMenuItems
                              team={team}
                              primitives={{
                                 Item: DropdownMenuItem,
                                 Separator: DropdownMenuSeparator,
                                 Shortcut: DropdownMenuShortcut,
                              }}
                              onRequestDelete={() => setConfirmOpen(true)}
                           />
                        </DropdownMenuContent>
                     </DropdownMenu>
                  </SidebarMenuButton>
               </CollapsibleTrigger>
               <CollapsibleContent>
                  <SidebarMenuSub>
                     <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === `${base}/overview`}>
                           <Link href={`${base}/overview`}>
                              <Home size={14} />
                              <span>Home</span>
                           </Link>
                        </SidebarMenuSubButton>
                     </SidebarMenuSubItem>
                     <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === `${base}/all`}>
                           <Link href={`${base}/all`}>
                              <CopyMinus size={14} />
                              <span>Issues</span>
                           </Link>
                        </SidebarMenuSubButton>
                     </SidebarMenuSubItem>
                     <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === `${base}/cycles`}>
                           <Link href={`${base}/cycles`}>
                              <RiDonutChartFill size={14} />
                              <span>Cycles</span>
                           </Link>
                        </SidebarMenuSubButton>
                        <SidebarMenuSub className="mr-0 pr-0">
                           <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                 asChild
                                 isActive={pathname === `${base}/cycle/active`}
                              >
                                 <Link href={`${base}/cycle/active`}>
                                    <span>Current</span>
                                 </Link>
                              </SidebarMenuSubButton>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                 asChild
                                 isActive={pathname === `${base}/cycle/upcoming`}
                              >
                                 <Link href={`${base}/cycle/upcoming`}>
                                    <span>Upcoming</span>
                                 </Link>
                              </SidebarMenuSubButton>
                           </SidebarMenuSubItem>
                        </SidebarMenuSub>
                     </SidebarMenuSubItem>
                     <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === `${base}/projects`}>
                           <Link href={`${base}/projects`}>
                              <Box size={14} />
                              <span>Projects</span>
                           </Link>
                        </SidebarMenuSubButton>
                     </SidebarMenuSubItem>
                     <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={pathname === `${base}/views`}>
                           <Link href={`${base}/views`}>
                              <Layers size={14} />
                              <span>Views</span>
                           </Link>
                        </SidebarMenuSubButton>
                     </SidebarMenuSubItem>
                  </SidebarMenuSub>
               </CollapsibleContent>
            </SidebarMenuItem>
         </Collapsible>

         <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete team?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This removes “{team.name}”. Only possible when the team has no issues, projects
                     or cycles. This cannot be undone.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(e) => {
                        e.preventDefault();
                        void remove();
                     }}
                     disabled={busy}
                  >
                     Delete
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}

export function NavTeams() {
   const teams = useWorkspaceStore((s) => s.teams);
   const joinedTeams = teams.filter((t) => t.joined);
   return (
      <CollapsibleSidebarGroup label="Your teams" sectionKey="teams">
         <SidebarMenu>
            {joinedTeams.map((item, index) => (
               <TeamNavItem key={item.id} team={item} defaultOpen={index === 0} />
            ))}
         </SidebarMenu>
      </CollapsibleSidebarGroup>
   );
}
