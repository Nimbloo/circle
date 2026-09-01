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
            className="h-12 pl-[18px] pr-[34px] flex w-full items-center text-[13px] hover:bg-accent/40"
         >
            {/* Name + identifier */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
               <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded bg-muted/50 text-xs">
                  {team.icon}
               </span>
               <span className="flex min-w-0 items-center gap-3">
                  <span className="truncate font-medium leading-4">{team.name}</span>
                  <span className="shrink-0 font-medium leading-4 text-muted-foreground/50">
                     {team.id}
                  </span>
               </span>
            </div>

            {displayProperties.membership && (
               <div className="hidden w-[96px] shrink-0 sm:block">
                  {team.joined && (
                     <span className="box-border inline-flex h-[19px] items-center gap-1 rounded border px-[3px] text-xs font-medium leading-[normal] text-muted-foreground">
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
               <div className="flex w-[126px] shrink-0 items-center gap-1.5">
                  {team.members.length > 0 && (
                     <>
                        <span className="flex -space-x-2">
                           {team.members.slice(0, 6).map((member) => (
                              <Avatar key={member.id} className="size-4 border border-container">
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
               <div className="hidden w-[88px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground md:flex">
                  {cycles.length > 0 && (
                     <>
                        <Play className="size-3.5" />
                        {cycles.length}
                     </>
                  )}
               </div>
            )}

            {displayProperties.projects && (
               <div className="hidden w-[154px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <Box className="size-3.5" />
                  {uniqueProjects}
               </div>
            )}
         </Link>
      </TeamContextMenu>
   );
}
