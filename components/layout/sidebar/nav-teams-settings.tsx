'use client';

import Link from 'next/link';
import { PlusIcon } from 'lucide-react';

import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useParams } from 'next/navigation';

export function NavTeamsSettings() {
   const { orgId } = useParams<{ orgId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const joinedTeams = teams.filter((t) => t.joined);
   return (
      <SidebarGroup>
         <SidebarGroupLabel>Your teams</SidebarGroupLabel>
         <SidebarMenu>
            {joinedTeams.map((team) => (
               <SidebarMenuItem key={team.id}>
                  <SidebarMenuButton asChild>
                     <Link href={`/${orgId}/settings/teams/${team.id}`}>
                        <div className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-muted/50">
                           <div className="text-[10px]">{team.icon}</div>
                        </div>
                        <span>{team.name}</span>
                     </Link>
                  </SidebarMenuButton>
               </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
               <SidebarMenuButton asChild>
                  <Link href={`/${orgId}/settings/teams/new`}>
                     <PlusIcon className="size-3.5" />
                     <span>Join or create a team</span>
                  </Link>
               </SidebarMenuButton>
            </SidebarMenuItem>
         </SidebarMenu>
      </SidebarGroup>
   );
}
