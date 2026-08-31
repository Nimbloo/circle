'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Team } from '@/data/teams';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useTeamsDisplayStore } from '@/store/teams-display-store';
import { Box, Check, Play } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TeamContextMenu } from './team-context-menu';

interface TeamLineProps {
   team: Team;
}

export default function TeamLine({ team }: TeamLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const { displayProperties } = useTeamsDisplayStore();
   // Deriva da fatia assinada: `getCyclesByTeam` devolve array NOVO a cada leitura,
   // entao nao pode ir dentro do seletor (referencia nova = re-render infinito).
   const allCycles = useWorkspaceStore((s) => s.cycles);
   const cycles = allCycles.filter((c) => c.teamId === team.id);
   const uniqueProjects = new Set(team.projects.map((project) => project.id)).size;
   const owner = team.members[0];

   return (
      <TeamContextMenu team={team}>
         <Link
            href={`/${orgId}/team/${team.id}/overview`}
            className="w-full flex items-center py-2.5 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm"
         >
            {/* Name + identifier */}
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
               <span className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0 text-sm">
                  {team.icon}
               </span>
               <span className="font-medium truncate">{team.name}</span>
               <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">
                  {team.id}
               </span>
            </div>

            {displayProperties.membership && (
               <div className="hidden sm:block w-[110px] shrink-0">
                  {team.joined && (
                     <span className="inline-flex items-center gap-1 text-xs border rounded-md px-1.5 py-0.5 text-muted-foreground">
                        <Check className="size-3" />
                        Joined
                     </span>
                  )}
               </div>
            )}

            {displayProperties.owners && (
               <div className="hidden lg:block w-[70px] shrink-0">
                  {owner && (
                     <Avatar className="size-5">
                        <AvatarImage src={owner.avatarUrl || undefined} alt={owner.name} />
                        <AvatarFallback>{owner.name[0]}</AvatarFallback>
                     </Avatar>
                  )}
               </div>
            )}

            {displayProperties.members && (
               <div className="w-[150px] shrink-0 flex items-center gap-1.5">
                  {team.members.length > 0 && (
                     <>
                        <span className="flex -space-x-1.5">
                           {team.members.slice(0, 6).map((member) => (
                              <Avatar key={member.id} className="size-5 border-2 border-container">
                                 <AvatarImage
                                    src={member.avatarUrl || undefined}
                                    alt={member.name}
                                 />
                                 <AvatarFallback>{member.name[0]}</AvatarFallback>
                              </Avatar>
                           ))}
                        </span>
                        <span className="text-xs text-muted-foreground">{team.members.length}</span>
                     </>
                  )}
               </div>
            )}

            {displayProperties.cycle && (
               <div className="hidden md:flex w-[80px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {cycles.length > 0 && (
                     <>
                        <Play className="size-3.5" />
                        {cycles.length}
                     </>
                  )}
               </div>
            )}

            {displayProperties.projects && (
               <div className="hidden sm:flex w-[80px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Box className="size-3.5" />
                  {uniqueProjects}
               </div>
            )}
         </Link>
      </TeamContextMenu>
   );
}
