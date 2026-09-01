'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { adaptFolders } from '@/lib/adapters-documents';
import { ListSkeleton } from '@/components/common/list-skeleton';
import { api } from '@/lib/client';
import type { TeamDocument } from '@/data/documents';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Box, CopyMinus, Inbox, Layers, Settings } from 'lucide-react';
import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Team Home — "Overview" tab: team identity, pinned resources and
 * quick links, Linear-style.
 */
export default function TeamOverview() {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const loaded = useWorkspaceStore((s) => s.loaded);
   // Sem fallback `?? teams[0]`: com id inválido, mostrar o PRIMEIRO time era pior
   // que um not-found honesto (a URL dizia um time e a tela mostrava outro).
   const team = teams.find((t) => t.id === teamId);

   const [pinnedDocuments, setPinnedDocuments] = useState<TeamDocument[]>([]);

   useEffect(() => {
      if (!teamId) return;
      let active = true;
      api.teams
         .documents(teamId)
         .then((dtos) => {
            if (active) {
               setPinnedDocuments(
                  adaptFolders(dtos)
                     .flatMap((folder) => folder.documents)
                     .filter((doc) => doc.pinned)
               );
            }
         })
         .catch(() => {
            if (active) setPinnedDocuments([]);
         });
      return () => {
         active = false;
      };
   }, [teamId]);

   if (!team) {
      // Workspace ainda hidratando → skeleton; "not found" só é estado FINAL
      // (antes, deep-link frio mostrava "Team not found." por segundos até o hydrate).
      if (!loaded) {
         return (
            <div className="p-8">
               <ListSkeleton rows={5} />
            </div>
         );
      }
      return <div className="p-8 text-sm text-muted-foreground">Team not found.</div>;
   }

   const goToLinks = [
      { label: 'Team settings', icon: Settings, href: `/${orgId}/settings` },
      { label: 'Issues', icon: CopyMinus, href: `/${orgId}/team/${team.id}/all` },
      { label: 'Triage', icon: Inbox, href: `/${orgId}/team/${team.id}/triage` },
      { label: 'Cycles', icon: CyclePlayIcon, href: `/${orgId}/team/${team.id}/cycles` },
      { label: 'Projects', icon: Box, href: `/${orgId}/projects` },
      { label: 'Views', icon: Layers, href: `/${orgId}/team/${team.id}/views` },
   ];

   return (
      <div className="w-full max-w-5xl -translate-x-[9px] mx-auto px-8 py-6 flex flex-col lg:flex-row gap-12">
         {/* Main column */}
         <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
               <div className="inline-flex size-9 bg-muted/50 items-center justify-center rounded-lg text-lg shrink-0">
                  {team.icon}
               </div>
               <h1 className="text-2xl font-semibold leading-8">{team.name}</h1>
            </div>

            <p className="mt-5 text-[15px] font-[450] leading-[23px] text-muted-foreground">
               Add a description...
            </p>

            <div className="mt-[34px]">
               <div className="flex h-7 items-center justify-between">
                  <h2 className="text-lg font-medium leading-[normal]">Team resources</h2>
               </div>

               <div className="mt-2 flex flex-col gap-1">
                  {pinnedDocuments.length === 0 && (
                     <p className="text-[15px] font-[450] leading-[23px] text-muted-foreground">
                        Add documents and links. Organize by creating sections.
                     </p>
                  )}
                  {pinnedDocuments.map((doc) => (
                     <Link
                        key={doc.id}
                        href={`/${orgId}/team/${team.id}/documents`}
                        className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-sidebar/50 text-sm"
                     >
                        <span className="text-base leading-none">{doc.icon}</span>
                        <span className="font-medium">{doc.name}</span>
                     </Link>
                  ))}
               </div>
            </div>
         </div>

         {/* Side column */}
         <div className="w-full shrink-0 pt-4 lg:w-[212px]">
            <h3 className="text-[13px] font-medium leading-[normal] text-muted-foreground">
               Members
            </h3>
            <Link
               href={`/${orgId}/team/${team.id}/members`}
               className="mt-3 flex h-7 items-center gap-2 hover:opacity-80"
            >
               <div className="flex -space-x-1.5">
                  {team.members.slice(0, 4).map((member) => (
                     <Avatar key={member.id} className="size-[18px] ring-2 ring-background">
                        <AvatarImage src={member.avatarUrl || undefined} alt={member.name} />
                        <AvatarFallback>{member.name[0]}</AvatarFallback>
                     </Avatar>
                  ))}
               </div>
               <span className="text-xs font-medium text-muted-foreground">
                  {team.members.length}
               </span>
            </Link>

            <h3 className="mt-6 text-[13px] font-medium leading-[normal] text-muted-foreground">
               Go to
            </h3>
            <div className="mt-3 flex flex-col">
               {goToLinks.map((link) => (
                  <Link
                     key={link.label}
                     href={link.href}
                     className="-mx-[7px] flex h-7 items-center gap-[7px] rounded-md px-[7px] text-[13px] font-medium hover:bg-accent/40"
                  >
                     <link.icon className="size-3.5 text-muted-foreground" />
                     {link.label}
                  </Link>
               ))}
            </div>
         </div>
      </div>
   );
}
