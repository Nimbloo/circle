'use client';

import { useWorkspaceStore } from '@/store/workspace-store';
import { useTeamsFilterStore } from '@/store/team-filter-store';
import { useTeamsDisplayStore } from '@/store/teams-display-store';
import { Users } from 'lucide-react';
import { useMemo } from 'react';
import { Filter } from '@/components/layout/headers/teams/filter';
import TeamLine from './team-line';
import { TeamsDisplayOptions } from './teams-display-options';
import { NewTeamButton } from './new-team-button';

export default function Teams() {
   const allTeams = useWorkspaceStore((s) => s.teams);
   const { filters } = useTeamsFilterStore();
   const { ordering, displayProperties } = useTeamsDisplayStore();

   const displayed = useMemo(() => {
      let list = allTeams.slice();

      if (filters.membership.length > 0) {
         const selectedMembership = new Set(filters.membership);
         list = list.filter((team) =>
            selectedMembership.has(team.joined ? 'Joined' : 'Not-Joined')
         );
      }
      if (filters.identifier.length > 0) {
         const selectedIdentifiers = new Set(filters.identifier);
         list = list.filter((team) => selectedIdentifiers.has(team.id));
      }

      const compare = (a: (typeof list)[number], b: (typeof list)[number]) => {
         switch (ordering) {
            case 'members':
               return b.members.length - a.members.length;
            case 'projects':
               return b.projects.length - a.projects.length;
            case 'name':
            default:
               return a.name.localeCompare(b.name);
         }
      };
      return list.sort(compare);
   }, [allTeams, filters, ordering]);

   return (
      <div className="w-full">
         {/* Count + view controls (Linear-style) */}
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10 sticky top-0 bg-container z-20">
            <span className="text-sm text-muted-foreground">
               {displayed.length} {displayed.length === 1 ? 'team' : 'teams'}
            </span>
            {/* "New team" vive no header da página (headers/teams/header-nav) — não duplicar
                aqui no toolbar da lista (era o 2º botão idêntico que o usuário via). */}
            <div className="flex items-center gap-1">
               <Filter />
               <TeamsDisplayOptions />
            </div>
         </div>

         {/* Column headers */}
         <div className="bg-container px-6 py-1.5 text-sm flex items-center text-muted-foreground border-b sticky top-10 z-10">
            <div className="flex-1 min-w-0">Name</div>
            {displayProperties.membership && (
               <div className="hidden sm:block w-[110px] shrink-0">Membership</div>
            )}
            {displayProperties.owners && (
               <div className="hidden lg:block w-[70px] shrink-0">Owners</div>
            )}
            {displayProperties.members && <div className="w-[150px] shrink-0">Members</div>}
            {displayProperties.cycle && (
               <div className="hidden md:block w-[80px] shrink-0">Cycle</div>
            )}
            {displayProperties.projects && (
               <div className="hidden sm:block w-[80px] shrink-0">Projects</div>
            )}
         </div>

         <div className="w-full">
            {displayed.length === 0 ? (
               <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                     <Users className="size-6" />
                  </div>
                  <div className="flex flex-col gap-1">
                     <p className="text-sm font-medium">
                        {filters.membership.length > 0 || filters.identifier.length > 0
                           ? 'No teams match your filters'
                           : 'No teams yet'}
                     </p>
                     <p className="max-w-xs text-sm text-muted-foreground">
                        {filters.membership.length > 0 || filters.identifier.length > 0
                           ? 'Try clearing or adjusting the filters above.'
                           : 'Teams organize issues, cycles and projects around the people working together.'}
                     </p>
                  </div>
                  {filters.membership.length === 0 && filters.identifier.length === 0 && (
                     <NewTeamButton />
                  )}
               </div>
            ) : (
               displayed.map((team) => <TeamLine key={team.id} team={team} />)
            )}
         </div>
      </div>
   );
}
