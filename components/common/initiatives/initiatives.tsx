'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/common/list-skeleton';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCommandPages } from '@/components/ui/use-command-pages';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Initiative, INITIATIVE_STATUS_META, InitiativeStatus } from '@/data/initiatives';
import { health as allHealth } from '@/data/projects';
import { usePriorities } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { InitiativesFilterType, useInitiativesFilterStore } from '@/store/initiatives-filter-store';
import {
   InitiativesDisplayProperties,
   useInitiativesDisplayStore,
} from '@/store/initiatives-display-store';
import {
   BadgeCheck,
   CheckIcon,
   ChevronRight,
   Goal,
   HeartPulse,
   ListFilter,
   SlidersHorizontal,
   UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { InitiativeStatusIcon } from './initiative-status-icon';
import { InitiativesSidePanel } from './initiatives-side-panel';
import { InlineNewInitiative } from './inline-new-initiative';
import { InitiativeContextMenu } from './initiative-context-menu';
import { InitiativeGlyph } from './initiative-glyph';
import { useInlineInitiativeStore } from '@/store/inline-initiative-store';

export const INITIATIVE_TABS = ['active', 'planned', 'all'] as const;

/* --------------------------------- filter --------------------------------- */

export function InitiativesFilter() {
   const [open, setOpen] = useState(false);
   const navigation = useCommandPages<'root' | InitiativesFilterType>('root', () => setOpen(false));
   const active = navigation.page === 'root' ? null : navigation.page;
   const users = useWorkspaceStore((s) => s.users);
   const priorities = usePriorities();
   const { filters, toggleFilter, clearFilters, getActiveFiltersCount } =
      useInitiativesFilterStore();

   const count = getActiveFiltersCount();

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
               aria-label="Filter initiatives"
            >
               <ListFilter className="size-4" />
               {count > 0 && (
                  <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground text-[9px] inline-flex items-center justify-center">
                     {count}
                  </span>
               )}
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-60 p-0">
            <Command onKeyDown={navigation.onKeyDown}>
               <CommandInput
                  ref={navigation.searchInputRef}
                  value={navigation.query}
                  onValueChange={navigation.setQuery}
                  placeholder={active ? 'Filter...' : 'Add filter...'}
               />
               <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  {!active && (
                     <CommandGroup>
                        <CommandItem
                           data-command-page="status"
                           onSelect={() => navigation.push('status')}
                        >
                           <BadgeCheck className="size-4 text-muted-foreground" />
                           Status
                           <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                        </CommandItem>
                        <CommandItem
                           data-command-page="priority"
                           onSelect={() => navigation.push('priority')}
                        >
                           <SlidersHorizontal className="size-4 text-muted-foreground" />
                           Priority
                           <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                        </CommandItem>
                        <CommandItem
                           data-command-page="owner"
                           onSelect={() => navigation.push('owner')}
                        >
                           <UserRound className="size-4 text-muted-foreground" />
                           Owner
                           <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                        </CommandItem>
                        <CommandItem
                           data-command-page="health"
                           onSelect={() => navigation.push('health')}
                        >
                           <HeartPulse className="size-4 text-muted-foreground" />
                           Health
                           <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                        </CommandItem>
                        {count > 0 && (
                           <CommandItem onSelect={() => clearFilters()}>Clear filters</CommandItem>
                        )}
                     </CommandGroup>
                  )}
                  {active === 'status' && (
                     <CommandGroup>
                        {(Object.keys(INITIATIVE_STATUS_META) as InitiativeStatus[]).map(
                           (statusId) => (
                              <CommandItem
                                 key={statusId}
                                 onSelect={() => toggleFilter('status', statusId)}
                              >
                                 <InitiativeStatusIcon status={statusId} />
                                 {INITIATIVE_STATUS_META[statusId].label}
                                 {filters.status.includes(statusId) && (
                                    <CheckIcon className="ml-auto size-3.5" />
                                 )}
                              </CommandItem>
                           )
                        )}
                     </CommandGroup>
                  )}
                  {active === 'priority' && (
                     <CommandGroup>
                        {priorities.map((priority) => (
                           <CommandItem
                              key={priority.id}
                              onSelect={() => toggleFilter('priority', priority.id)}
                           >
                              <priority.icon className="size-4 text-muted-foreground" />
                              {priority.name}
                              {filters.priority.includes(priority.id) && (
                                 <CheckIcon className="ml-auto size-3.5" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  )}
                  {active === 'owner' && (
                     <CommandGroup>
                        {users.slice(0, 10).map((user) => (
                           <CommandItem
                              key={user.id}
                              onSelect={() => toggleFilter('owner', user.id)}
                           >
                              <Avatar className="size-4">
                                 <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
                                 <AvatarFallback className="text-[8px]">
                                    {user.name[0]}
                                 </AvatarFallback>
                              </Avatar>
                              {user.name}
                              {filters.owner.includes(user.id) && (
                                 <CheckIcon className="ml-auto size-3.5" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  )}
                  {active === 'health' && (
                     <CommandGroup>
                        {allHealth.map((entry) => (
                           <CommandItem
                              key={entry.id}
                              onSelect={() => toggleFilter('health', entry.id)}
                           >
                              <span
                                 className="size-2.5 rounded-full"
                                 style={{ backgroundColor: entry.color }}
                              />
                              {entry.name}
                              {filters.health.includes(entry.id) && (
                                 <CheckIcon className="ml-auto size-3.5" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  )}
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

/* ----------------------------- display options ---------------------------- */

const PROPERTY_CHIPS: { key: keyof InitiativesDisplayProperties; label: string }[] = [
   { key: 'description', label: 'Description' },
   { key: 'owner', label: 'Owner' },
   { key: 'status', label: 'Status' },
   { key: 'priority', label: 'Priority' },
   { key: 'health', label: 'Health' },
   { key: 'projects', label: 'Projects' },
   { key: 'activeProjects', label: 'Active projects' },
   { key: 'target', label: 'Target date' },
];

export function InitiativesDisplayOptions() {
   const { grouping, ordering, displayProperties, setGrouping, setOrdering, toggleProperty } =
      useInitiativesDisplayStore();

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button size="xs" variant="ghost" className="size-7 p-0" aria-label="Display options">
               <SlidersHorizontal className="size-4" />
            </Button>
         </PopoverTrigger>
         <PopoverContent
            align="end"
            sideOffset={4}
            className="w-[302px] rounded-xl border-[var(--popover-border)] bg-popover p-0"
            style={{ boxShadow: 'var(--popover-shadow)' }}
         >
            <div className="flex h-20 flex-col px-4 py-2">
               <div className="flex h-8 w-full items-center justify-between">
                  <span className="w-20 text-xs font-medium leading-[normal] text-muted-foreground">
                     Grouping
                  </span>
                  <span className="flex flex-1 justify-end">
                     <Select
                        value={grouping}
                        onValueChange={(value) => setGrouping(value as typeof grouping)}
                     >
                        <SelectTrigger className="relative h-6 w-[100px] rounded-lg border-transparent px-2 py-px pr-[18px] text-xs leading-[normal] shadow-none [&_svg]:absolute [&_svg]:right-2 [&_svg]:size-2.5">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="none">No grouping</SelectItem>
                           <SelectItem value="status">Status</SelectItem>
                        </SelectContent>
                     </Select>
                  </span>
               </div>
               <div className="flex h-8 w-full items-center justify-between">
                  <span className="w-20 text-xs font-medium leading-[normal] text-muted-foreground">
                     Ordering
                  </span>
                  <span className="flex flex-1 justify-end">
                     <Select
                        value={ordering}
                        onValueChange={(value) => setOrdering(value as typeof ordering)}
                     >
                        <SelectTrigger className="relative h-6 w-[100px] rounded-lg border-transparent px-2 py-px pr-[18px] text-xs leading-[normal] shadow-none [&_svg]:absolute [&_svg]:right-2 [&_svg]:size-2.5">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="manual">Manual</SelectItem>
                           <SelectItem value="name">Name</SelectItem>
                           <SelectItem value="target">Target date</SelectItem>
                        </SelectContent>
                     </Select>
                  </span>
               </div>
            </div>
            <div className="flex flex-col border-t px-4 py-2">
               <span className="mb-1 mt-2 text-xs font-medium leading-[normal] text-muted-foreground">
                  Display properties
               </span>
               <div className="mt-2 flex flex-wrap gap-px">
                  {PROPERTY_CHIPS.map(({ key, label }) => (
                     <button
                        key={key}
                        type="button"
                        onClick={() => toggleProperty(key)}
                        className={cn(
                           'mr-1 mb-1 h-6 rounded-full border border-transparent px-2 text-xs font-medium leading-[normal] transition-colors',
                           displayProperties[key]
                              ? 'bg-accent text-foreground'
                              : 'bg-muted/40 text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        )}
                     >
                        {label}
                     </button>
                  ))}
               </div>
            </div>
         </PopoverContent>
      </Popover>
   );
}

/* ---------------------------------- rows ---------------------------------- */

const ACTIVE_DOT_COLORS: Record<string, string> = {
   'no-update': '#95a2b3',
   'on-track': '#4cb782',
   'at-risk': '#f2c94c',
   'off-track': '#eb5757',
};

function ActiveProjectDots({ initiative }: { initiative: Initiative }) {
   // Deriva da fatia assinada: o getter devolve array NOVO a cada leitura, entao nao
   // pode ir dentro do seletor (referencia nova = re-render infinito).
   const allProjects = useWorkspaceStore((s) => s.projects);
   const linked = new Set(initiative.projectIds);
   const started = allProjects.filter(
      (project) => linked.has(project.id) && project.status.category === 'started'
   );
   const byHealth = new Map<string, number>();
   for (const project of started) {
      byHealth.set(project.health.id, (byHealth.get(project.health.id) ?? 0) + 1);
   }
   return (
      <span className="flex items-center gap-2">
         {[...byHealth.entries()].map(([healthId, count]) => (
            <span key={healthId} className="inline-flex items-center gap-1 text-xs">
               <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: ACTIVE_DOT_COLORS[healthId] ?? '#95a2b3' }}
               />
               {count}
            </span>
         ))}
      </span>
   );
}

function InitiativeRow({
   initiative,
   orgId,
   showStatus,
}: {
   initiative: Initiative;
   orgId: string;
   showStatus: boolean;
}) {
   const { displayProperties } = useInitiativesDisplayStore();
   // Deriva da fatia assinada: o getter devolve array NOVO a cada leitura, entao nao
   // pode ir dentro do seletor (referencia nova = re-render infinito).
   const allProjects = useWorkspaceStore((s) => s.projects);
   const linkedIds = new Set(initiative.projectIds);
   const projects = allProjects.filter((p) => linkedIds.has(p.id));
   // Mesma regra do `countCompletedProjects` do store, derivada da fatia ja assinada.
   const completed = projects.filter(
      (p) => p.status.category === 'completed' || p.percentComplete >= 100
   ).length;

   return (
      <InitiativeContextMenu initiative={initiative}>
         <Link
            href={`/${orgId}/initiative/${initiative.id}`}
            className="h-[52px] pl-[52px] pr-[34px] flex items-center gap-3 rounded-lg text-[13px] hover:bg-accent/40 transition-colors"
         >
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
               <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/50 text-sm">
                  <InitiativeGlyph icon={initiative.icon} color={initiative.iconColor} />
               </span>
               <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium leading-4">{initiative.name}</span>
                  {displayProperties.description && initiative.description && (
                     <span className="truncate text-xs leading-4 text-muted-foreground">
                        {initiative.description}
                     </span>
                  )}
               </span>
            </span>
            {showStatus && displayProperties.status && (
               <span className="hidden md:flex items-center gap-1.5 w-28 shrink-0 text-xs">
                  <InitiativeStatusIcon status={initiative.status} />
                  {INITIATIVE_STATUS_META[initiative.status].label}
               </span>
            )}
            {displayProperties.priority && (
               <span className="hidden sm:flex w-[56px] shrink-0 items-center">
                  <initiative.priority.icon className="size-4 text-muted-foreground" />
               </span>
            )}
            {displayProperties.owner && (
               <span className="hidden sm:flex w-[50px] shrink-0">
                  {initiative.owner ? (
                     <Avatar className="size-5">
                        <AvatarImage
                           src={initiative.owner.avatarUrl || undefined}
                           alt={initiative.owner.name}
                        />
                        <AvatarFallback className="text-[9px]">
                           {initiative.owner.name[0]}
                        </AvatarFallback>
                     </Avatar>
                  ) : (
                     <UserRound className="size-4 text-muted-foreground" />
                  )}
               </span>
            )}
            {displayProperties.target && (
               <span className="hidden md:block w-[100px] shrink-0 text-xs text-muted-foreground">
                  {initiative.target ?? '—'}
               </span>
            )}
            {displayProperties.projects && (
               <span className="hidden md:flex items-center gap-1 w-[59px] shrink-0 text-xs text-muted-foreground">
                  <BadgeCheck className="size-3.5 text-violet-400" />
                  {completed} / {projects.length}
               </span>
            )}
            {displayProperties.health && (
               <span className="hidden xl:flex items-center gap-1.5 w-[108px] shrink-0 text-xs text-muted-foreground">
                  <span
                     className={cn(
                        'size-3.5 rounded-full border-2 shrink-0',
                        initiative.health.id === 'no-update' && 'border-muted-foreground/40'
                     )}
                     style={
                        initiative.health.id !== 'no-update'
                           ? { borderColor: initiative.health.color }
                           : undefined
                     }
                  />
                  {initiative.health.id === 'no-update' ? 'No updates' : initiative.health.name}
               </span>
            )}
            {displayProperties.activeProjects && (
               <span className="hidden xl:block w-[98px] shrink-0">
                  <ActiveProjectDots initiative={initiative} />
               </span>
            )}
         </Link>
      </InitiativeContextMenu>
   );
}

/* ---------------------------------- page ---------------------------------- */

export default function Initiatives() {
   const { orgId } = useParams<{ orgId: string }>();
   const [tab] = useQueryState('tab', parseAsStringLiteral(INITIATIVE_TABS).withDefault('active'));
   const { filters } = useInitiativesFilterStore();
   const { grouping, ordering, displayProperties } = useInitiativesDisplayStore();
   const openPanel = useRightPanelStore((state) => state.openPanel);
   const allInitiatives = useWorkspaceStore((s) => s.initiatives);
   const loaded = useWorkspaceStore((s) => s.loaded);
   const creating = useInlineInitiativeStore((s) => s.creating);
   const startCreate = useInlineInitiativeStore((s) => s.start);
   const prefersReducedMotion = useReducedMotion();

   const displayed = useMemo(() => {
      let list = allInitiatives.slice();
      if (tab !== 'all') list = list.filter((initiative) => initiative.status === tab);
      if (filters.status.length > 0) {
         list = list.filter((initiative) => filters.status.includes(initiative.status));
      }
      if (filters.priority.length > 0) {
         list = list.filter((initiative) => filters.priority.includes(initiative.priority.id));
      }
      if (filters.owner.length > 0) {
         list = list.filter(
            (initiative) => initiative.owner && filters.owner.includes(initiative.owner.id)
         );
      }
      if (filters.health.length > 0) {
         list = list.filter((initiative) => filters.health.includes(initiative.health.id));
      }
      if (ordering === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
      else if (ordering === 'target')
         list.sort((a, b) => (a.target ?? '').localeCompare(b.target ?? ''));
      return list;
   }, [tab, filters, ordering, allInitiatives]);

   const groups = useMemo(() => {
      if (grouping !== 'status') return null;
      return (Object.keys(INITIATIVE_STATUS_META) as InitiativeStatus[])
         .map((statusId) => ({
            statusId,
            items: displayed.filter((initiative) => initiative.status === statusId),
         }))
         .filter((group) => group.items.length > 0);
   }, [grouping, displayed]);

   const showStatus = tab === 'all';

   return (
      <div className="w-full h-full flex overflow-hidden">
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="flex h-8 pl-[52px] pr-[34px] items-center gap-3 text-xs font-[450] leading-[15px] text-[var(--table-header-foreground)]">
               <span className="flex-1 pl-1.5">Name</span>
               {showStatus && displayProperties.status && (
                  <span className="hidden md:block w-28 shrink-0">Status</span>
               )}
               {displayProperties.priority && (
                  <span className="hidden sm:block w-[56px] shrink-0">Priority</span>
               )}
               {displayProperties.owner && (
                  <span className="hidden sm:block w-[50px] shrink-0">Owner</span>
               )}
               {displayProperties.target && (
                  <span className="hidden md:block w-[100px] shrink-0">Target</span>
               )}
               {displayProperties.projects && (
                  <span className="hidden md:block w-[59px] shrink-0">Projects</span>
               )}
               {displayProperties.health && (
                  <span className="hidden xl:block w-[108px] shrink-0">Health</span>
               )}
               {displayProperties.activeProjects && (
                  <span className="hidden xl:block w-[98px] shrink-0">Active Projects</span>
               )}
            </div>

            <AnimatePresence initial={false}>
               {creating && (
                  <motion.div
                     key="new-initiative"
                     initial={{ height: 0, opacity: 0 }}
                     animate={{ height: 'auto', opacity: 1 }}
                     exit={{ height: 0, opacity: 0 }}
                     transition={{
                        duration: prefersReducedMotion ? 0 : 0.2,
                        ease: [0.2, 0, 0, 1],
                     }}
                     className="overflow-hidden pt-3"
                  >
                     <InlineNewInitiative defaultStatus={tab} />
                  </motion.div>
               )}
            </AnimatePresence>

            {displayed.length === 0 && !creating && !loaded ? (
               // Hidratando → skeleton; o empty state "No initiatives yet" só depois
               // que o workspace chegou (fim do flash no deep-link frio).
               <div className="py-4">
                  <ListSkeleton rows={5} />
               </div>
            ) : displayed.length === 0 && !creating ? (
               <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                     <Goal className="size-6" />
                  </div>
                  <div className="flex flex-col gap-1">
                     <p className="text-sm font-medium">
                        {allInitiatives.length === 0
                           ? 'No initiatives yet'
                           : 'No initiatives match this view'}
                     </p>
                     <p className="max-w-xs text-sm text-muted-foreground">
                        {allInitiatives.length === 0
                           ? 'Initiatives group related projects toward a bigger goal.'
                           : 'Try switching tabs or clearing the filters.'}
                     </p>
                  </div>
                  {allInitiatives.length === 0 && (
                     <Button size="sm" onClick={startCreate}>
                        New initiative
                     </Button>
                  )}
               </div>
            ) : groups ? (
               groups.map((group) => (
                  <div key={group.statusId}>
                     <div className="flex items-center gap-2 px-6 h-9 text-sm font-medium bg-[color-mix(in_oklab,var(--accent)_30%,var(--container))] border-b border-border/40">
                        <InitiativeStatusIcon status={group.statusId} />
                        {INITIATIVE_STATUS_META[group.statusId].label}
                        <span className="text-xs text-muted-foreground">{group.items.length}</span>
                     </div>
                     {group.items.map((initiative) => (
                        <InitiativeRow
                           key={initiative.id}
                           initiative={initiative}
                           orgId={orgId}
                           showStatus={showStatus}
                        />
                     ))}
                  </div>
               ))
            ) : (
               displayed.map((initiative) => (
                  <InitiativeRow
                     key={initiative.id}
                     initiative={initiative}
                     orgId={orgId}
                     showStatus={showStatus}
                  />
               ))
            )}
         </div>
         {openPanel === 'initiatives-breakdown' && <InitiativesSidePanel initiatives={displayed} />}
      </div>
   );
}
