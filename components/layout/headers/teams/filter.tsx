'use client';

import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
   CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCommandPages } from '@/components/ui/use-command-pages';
import { useMemo, useState } from 'react';
import { CheckIcon, ChevronRight, ListFilter, Shield } from 'lucide-react';
import { Team } from '@/data/teams';
import { useTeamsFilterStore } from '@/store/team-filter-store';
import { useWorkspaceStore } from '@/store/workspace-store';

// Sort lives in Display Options (Ordering); the filter popover is filters-only.
type FilterType = 'membership' | 'identifiers';

const Membership: Array<'Joined' | 'Not-Joined'> = ['Joined', 'Not-Joined'];

export function Filter() {
   const [open, setOpen] = useState(false);
   const navigation = useCommandPages<'root' | FilterType>('root', () => setOpen(false));
   const active = navigation.page === 'root' ? null : navigation.page;
   const teams = useWorkspaceStore((s) => s.teams);

   const Identifiers: Team['id'][] = useMemo(() => {
      return teams.map((team) => team.id);
   }, [teams]);

   const { filters, toggleFilter, clearFilters, getActiveFiltersCount } = useTeamsFilterStore();

   return (
      <Popover
         open={open}
         onOpenChange={(next) => {
            setOpen(next);
            if (!next) navigation.reset();
         }}
      >
         <PopoverTrigger asChild>
            <Button
               size="xs"
               variant="ghost"
               className="relative size-7 p-0"
               aria-label="Filter teams"
            >
               <ListFilter className="size-4" />
               {getActiveFiltersCount() > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full size-4 flex items-center justify-center">
                     {getActiveFiltersCount()}
                  </span>
               )}
            </Button>
         </PopoverTrigger>
         <PopoverContent className="p-0 w-60" align="start">
            <div onKeyDown={navigation.onKeyDown}>
               {active === null ? (
                  <Command>
                     <CommandInput
                        ref={navigation.searchInputRef}
                        value={navigation.query}
                        onValueChange={navigation.setQuery}
                        placeholder="Add filter..."
                     />
                     <CommandList>
                        <CommandEmpty>No filters found.</CommandEmpty>
                        <CommandGroup>
                           <CommandItem
                              data-command-page="membership"
                              onSelect={() => navigation.push('membership')}
                              className="flex items-center justify-between cursor-pointer"
                           >
                              <span className="flex items-center gap-2">
                                 <Shield className="size-4 text-muted-foreground" />
                                 Members
                              </span>
                              <div className="flex items-center">
                                 {filters.membership.length > 0 && (
                                    <span className="text-xs text-muted-foreground mr-1">
                                       {filters.membership.length}
                                    </span>
                                 )}
                                 <ChevronRight className="size-4" />
                              </div>
                           </CommandItem>
                           <CommandItem
                              data-command-page="identifiers"
                              onSelect={() => navigation.push('identifiers')}
                              className="flex items-center justify-between cursor-pointer"
                           >
                              <span className="flex items-center gap-2">
                                 <Shield className="size-4 text-muted-foreground" />
                                 Identifiers
                              </span>
                              <div className="flex items-center">
                                 {filters.identifier.length > 0 && (
                                    <span className="text-xs text-muted-foreground mr-1">
                                       {filters.identifier.length}
                                    </span>
                                 )}
                                 <ChevronRight className="size-4" />
                              </div>
                           </CommandItem>
                        </CommandGroup>
                        {getActiveFiltersCount() > 0 && (
                           <>
                              <CommandSeparator />
                              <CommandGroup>
                                 <CommandItem
                                    onSelect={() => clearFilters()}
                                    className="cursor-pointer"
                                 >
                                    Clear all filters
                                 </CommandItem>
                              </CommandGroup>
                           </>
                        )}
                     </CommandList>
                  </Command>
               ) : active === 'membership' ? (
                  <Command>
                     <div className="flex items-center border-b p-2">
                        <Button
                           variant="ghost"
                           size="icon"
                           className="size-6"
                           onClick={navigation.back}
                           aria-label="Back"
                        >
                           <ChevronRight className="size-4 rotate-180" />
                        </Button>
                        <span className="ml-2 font-medium">Members</span>
                     </div>
                     <CommandInput
                        ref={navigation.searchInputRef}
                        value={navigation.query}
                        onValueChange={navigation.setQuery}
                        placeholder="Search membership..."
                     />
                     <CommandList>
                        <CommandEmpty>No membership status found.</CommandEmpty>
                        <CommandGroup>
                           {Membership.map((type) => (
                              <CommandItem
                                 key={type}
                                 value={type}
                                 onSelect={() => toggleFilter('membership', type)}
                                 className="flex items-center justify-between"
                              >
                                 {type}
                                 {filters.membership.includes(type) && <CheckIcon size={16} />}
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               ) : active === 'identifiers' ? (
                  <Command>
                     <div className="flex items-center border-b p-2">
                        <Button
                           variant="ghost"
                           size="icon"
                           className="size-6"
                           onClick={navigation.back}
                           aria-label="Back"
                        >
                           <ChevronRight className="size-4 rotate-180" />
                        </Button>
                        <span className="ml-2 font-medium">Identifiers</span>
                     </div>
                     <CommandInput
                        ref={navigation.searchInputRef}
                        value={navigation.query}
                        onValueChange={navigation.setQuery}
                        placeholder="Search identifiers..."
                     />
                     <CommandList>
                        <CommandEmpty>No identifiers found.</CommandEmpty>
                        <CommandGroup>
                           {Identifiers.map((id) => (
                              <CommandItem
                                 key={id}
                                 value={id}
                                 onSelect={() => toggleFilter('identifier', id)}
                                 className="flex items-center justify-between"
                              >
                                 {id}
                                 {filters.identifier.includes(id) && <CheckIcon size={16} />}
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               ) : null}
            </div>
         </PopoverContent>
      </Popover>
   );
}
