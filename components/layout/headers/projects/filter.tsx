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
import { health as allHealth } from '@/data/projects';
import { usePriorities } from '@/store/catalog-store';
import { useProjectsFilterStore } from '@/store/projects-filter-store';
import { useState } from 'react';
import { BarChart3, CheckIcon, ChevronRight, HeartPulse, ListFilter } from 'lucide-react';

// Sort lives in Display Options (Ordering); the filter popover is filters-only.
type FilterType = 'health' | 'priority';

export function Filter() {
   const [open, setOpen] = useState(false);
   const navigation = useCommandPages<'root' | FilterType>('root', () => setOpen(false));
   const active = navigation.page === 'root' ? null : navigation.page;
   const priorities = usePriorities();

   const { filters, toggleFilter, clearFilters, getActiveFiltersCount } = useProjectsFilterStore();

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
               aria-label="Filter projects"
            >
               <ListFilter className="size-4" />
               {getActiveFiltersCount() > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full size-4 flex items-center justify-center">
                     {getActiveFiltersCount()}
                  </span>
               )}
            </Button>
         </PopoverTrigger>
         <PopoverContent className="p-0 w-64" align="start">
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
                        <CommandGroup>
                           <CommandItem
                              data-command-page="health"
                              onSelect={() => navigation.push('health')}
                              className="flex items-center justify-between cursor-pointer"
                           >
                              <span className="flex items-center gap-2">
                                 <HeartPulse className="size-4 text-muted-foreground" />
                                 Health
                              </span>
                              <div className="flex items-center">
                                 {filters.health.length > 0 && (
                                    <span className="text-xs text-muted-foreground mr-1">
                                       {filters.health.length}
                                    </span>
                                 )}
                                 <ChevronRight className="size-4" />
                              </div>
                           </CommandItem>
                           <CommandItem
                              data-command-page="priority"
                              onSelect={() => navigation.push('priority')}
                              className="flex items-center justify-between cursor-pointer"
                           >
                              <span className="flex items-center gap-2">
                                 <BarChart3 className="size-4 text-muted-foreground" />
                                 Priority
                              </span>
                              <div className="flex items-center">
                                 {filters.priority.length > 0 && (
                                    <span className="text-xs text-muted-foreground mr-1">
                                       {filters.priority.length}
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
               ) : active === 'health' ? (
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
                        <span className="ml-2 font-medium">Health</span>
                     </div>
                     <CommandInput
                        ref={navigation.searchInputRef}
                        value={navigation.query}
                        onValueChange={navigation.setQuery}
                        placeholder="Search health..."
                     />
                     <CommandList>
                        <CommandEmpty>No health found.</CommandEmpty>
                        <CommandGroup>
                           {allHealth.map((h) => (
                              <CommandItem
                                 key={h.id}
                                 value={`${h.id} ${h.name}`}
                                 onSelect={() => toggleFilter('health', h.id)}
                                 className="flex items-center justify-between"
                              >
                                 <div className="flex items-center gap-2">
                                    <span
                                       className="size-3 rounded-full"
                                       style={{ backgroundColor: h.color }}
                                    />
                                    {h.name}
                                 </div>
                                 {filters.health.includes(h.id) && <CheckIcon size={16} />}
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               ) : active === 'priority' ? (
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
                        <span className="ml-2 font-medium">Priority</span>
                     </div>
                     <CommandInput
                        ref={navigation.searchInputRef}
                        value={navigation.query}
                        onValueChange={navigation.setQuery}
                        placeholder="Search priorities..."
                     />
                     <CommandList>
                        <CommandEmpty>No priorities found.</CommandEmpty>
                        <CommandGroup>
                           {priorities.map((p) => (
                              <CommandItem
                                 key={p.id}
                                 value={`${p.id} ${p.name}`}
                                 onSelect={() => toggleFilter('priority', p.id)}
                                 className="flex items-center justify-between"
                              >
                                 <div className="flex items-center gap-2">
                                    <p.icon className="text-muted-foreground size-4" />
                                    {p.name}
                                 </div>
                                 {filters.priority.includes(p.id) && <CheckIcon size={16} />}
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
