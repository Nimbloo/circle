'use client';

import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ViewFilter } from '@/lib/api/views';
import { useLabels, usePriorities, useStatuses } from '@/store/catalog-store';
import { CheckIcon, ListFilter, UserRound } from 'lucide-react';
import type { ComponentType, CSSProperties } from 'react';

type IconCmp = ComponentType<{ className?: string; style?: CSSProperties }>;

function Chip({ active, children }: { active?: boolean; children: React.ReactNode }) {
   return (
      <span
         className={cn(
            'inline-flex items-center gap-1.5 h-7 px-2 rounded-md border text-xs transition-colors cursor-pointer hover:bg-accent/50',
            active ? 'text-foreground' : 'text-muted-foreground'
         )}
      >
         {children}
      </span>
   );
}

/**
 * Construtor de filtro de uma saved view (o que faltava — sem ele toda view nascia
 * com filtro vazio e mostrava TUDO). Multi-select de Status/Priority/Labels + toggles
 * Unassigned / Has project. Emite um `ViewFilter` que o backend persiste e o
 * `filterIssuesForView`/`filterProjectsForView` aplica.
 */
export function ViewFilterEditor({
   type,
   filter,
   onChange,
}: {
   type: 'issue' | 'project';
   filter: ViewFilter;
   onChange: (next: ViewFilter) => void;
}) {
   const statuses = useStatuses();
   const priorities = usePriorities();
   const labels = useLabels();

   const toggleId = (key: 'statusIds' | 'priorityIds' | 'labelIds', id: string) => {
      const cur = filter[key] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      onChange({ ...filter, [key]: next.length ? next : undefined });
   };

   const statusCount = filter.statusIds?.length ?? 0;
   const priorityCount = filter.priorityIds?.length ?? 0;
   const labelCount = filter.labelIds?.length ?? 0;

   return (
      <div className="flex items-center gap-1.5 flex-wrap">
         {/* Status */}
         <Popover>
            <PopoverTrigger asChild>
               <Chip active={statusCount > 0}>
                  <ListFilter className="size-3.5" />
                  {statusCount > 0 ? `${statusCount} status` : 'Status'}
               </Chip>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-0">
               <Command>
                  <CommandInput placeholder="Status…" />
                  <CommandList>
                     <CommandEmpty>No results.</CommandEmpty>
                     <CommandGroup>
                        {statuses.map((s) => {
                           const Icon = s.icon as IconCmp;
                           return (
                              <CommandItem key={s.id} onSelect={() => toggleId('statusIds', s.id)}>
                                 <Icon className="size-4" style={{ color: s.color }} />
                                 {s.name}
                                 {filter.statusIds?.includes(s.id) && (
                                    <CheckIcon className="ml-auto size-3.5" />
                                 )}
                              </CommandItem>
                           );
                        })}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>

         {/* Priority */}
         <Popover>
            <PopoverTrigger asChild>
               <Chip active={priorityCount > 0}>
                  {priorityCount > 0 ? `${priorityCount} priority` : 'Priority'}
               </Chip>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-52 p-0">
               <Command>
                  <CommandInput placeholder="Priority…" />
                  <CommandList>
                     <CommandEmpty>No results.</CommandEmpty>
                     <CommandGroup>
                        {priorities.map((p) => {
                           const Icon = p.icon as IconCmp;
                           return (
                              <CommandItem
                                 key={p.id}
                                 onSelect={() => toggleId('priorityIds', p.id)}
                              >
                                 <Icon className="size-4 text-muted-foreground" />
                                 {p.name}
                                 {filter.priorityIds?.includes(p.id) && (
                                    <CheckIcon className="ml-auto size-3.5" />
                                 )}
                              </CommandItem>
                           );
                        })}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>

         {/* Labels + assignee/project toggles: só fazem sentido para views de issue */}
         {type === 'issue' && (
            <>
               <Popover>
                  <PopoverTrigger asChild>
                     <Chip active={labelCount > 0}>
                        {labelCount > 0 ? `${labelCount} labels` : 'Labels'}
                     </Chip>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-0">
                     <Command>
                        <CommandInput placeholder="Label…" />
                        <CommandList>
                           <CommandEmpty>No results.</CommandEmpty>
                           <CommandGroup>
                              {labels.map((l) => (
                                 <CommandItem
                                    key={l.id}
                                    onSelect={() => toggleId('labelIds', l.id)}
                                 >
                                    <span
                                       className="size-2.5 rounded-full"
                                       style={{ backgroundColor: l.color }}
                                    />
                                    {l.name}
                                    {filter.labelIds?.includes(l.id) && (
                                       <CheckIcon className="ml-auto size-3.5" />
                                    )}
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        </CommandList>
                     </Command>
                  </PopoverContent>
               </Popover>

               <button
                  type="button"
                  onClick={() =>
                     onChange({ ...filter, unassigned: filter.unassigned ? undefined : true })
                  }
               >
                  <Chip active={!!filter.unassigned}>
                     <UserRound className="size-3.5" />
                     Unassigned
                  </Chip>
               </button>

               <button
                  type="button"
                  onClick={() =>
                     onChange({ ...filter, hasProject: filter.hasProject ? undefined : true })
                  }
               >
                  <Chip active={!!filter.hasProject}>Has project</Chip>
               </button>
            </>
         )}
      </div>
   );
}
