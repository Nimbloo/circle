'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
   PROJECT_DISPLAY_PROPERTIES,
   type ProjectDisplayPropertyKey,
   ProjectsGrouping,
   ProjectsOrdering,
   ProjectsViewType,
   useProjectsDisplayStore,
} from '@/store/projects-display-store';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import {
   ArrowUpDown,
   ArrowUpNarrowWide,
   ChartNoAxesGantt,
   LayoutGrid,
   List,
   SlidersHorizontal,
} from 'lucide-react';

const VIEW_TYPES: { value: ProjectsViewType; label: string; icon: React.ElementType }[] = [
   { value: 'list', label: 'List', icon: List },
   { value: 'board', label: 'Board', icon: LayoutGrid },
   { value: 'timeline', label: 'Timeline', icon: ChartNoAxesGantt },
];

const GROUPINGS: { value: ProjectsGrouping; label: string }[] = [
   { value: 'status', label: 'Status' },
   { value: 'team', label: 'Team' },
   { value: 'none', label: 'No grouping' },
];

const ORDERINGS: { value: ProjectsOrdering; label: string }[] = [
   { value: 'start-date', label: 'Start date' },
   { value: 'target-date', label: 'Target date' },
   { value: 'title', label: 'Title' },
];

const DEFAULT_PROPERTY_VALUES: Record<ProjectDisplayPropertyKey, boolean> = {
   milestones: false,
   priority: true,
   status: true,
   health: true,
   lead: true,
   members: false,
   targetDate: true,
   issues: true,
   labels: false,
};

function OptionRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
   return (
      <div className="flex h-7 w-full items-center justify-between gap-3">
         <span className="text-xs text-muted-foreground">{label}</span>
         {children}
      </div>
   );
}

/** Linear-style Display popover for the Projects page (List/Board/Timeline). */
export function ProjectsDisplayOptions() {
   const [tab] = useQueryState(
      'tab',
      parseAsStringLiteral(['all', 'active'] as const).withDefault('all')
   );
   const {
      viewTypes,
      grouping,
      ordering,
      closedProjects,
      showEmptyGroups,
      showProjectList,
      showWeekNumbers,
      displayProperties,
      setViewType,
      setGrouping,
      setOrdering,
      setClosedProjects,
      setShowEmptyGroups,
      setShowProjectList,
      setShowWeekNumbers,
      toggleDisplayProperty,
      resetDisplaySettings,
   } = useProjectsDisplayStore();
   const viewType = viewTypes[tab];
   const isDefault =
      viewType === (tab === 'all' ? 'list' : 'timeline') &&
      grouping === 'status' &&
      ordering === 'start-date' &&
      closedProjects === 'all' &&
      !showEmptyGroups &&
      Object.entries(DEFAULT_PROPERTY_VALUES).every(
         ([key, enabled]) => displayProperties[key as ProjectDisplayPropertyKey] === enabled
      );

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button size="xs" variant="ghost" className="size-7 p-0" aria-label="Display options">
               <SlidersHorizontal className="size-4" />
            </Button>
         </PopoverTrigger>
         <PopoverContent
            align="end"
            sideOffset={5}
            className="min-h-[406px] w-[332px] rounded-xl border-[var(--popover-border)] bg-popover p-0 pt-2"
            style={{ boxShadow: 'var(--popover-shadow)' }}
         >
            <div className="flex h-[126px] flex-col gap-3 px-4 pb-3 pt-2">
               {/* View switcher */}
               <div className="grid h-8 grid-cols-3 gap-0.5">
                  {VIEW_TYPES.map((view) => (
                     <button
                        key={view.value}
                        type="button"
                        onClick={() => setViewType(tab, view.value)}
                        className={cn(
                           'm-0.5 flex h-7 items-center justify-center gap-1.5 rounded-full text-xs transition-colors',
                           viewType === view.value
                              ? 'bg-[var(--segmented-control-active)] font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                        )}
                     >
                        <view.icon className="size-4" />
                        {view.label}
                     </button>
                  ))}
               </div>

               {/* Grouping / ordering */}
               <div className="flex flex-col gap-1.5">
                  <OptionRow
                     label={
                        <span className="flex items-center gap-2">
                           <ArrowUpDown className="size-4 text-muted-foreground" />
                           Grouping
                        </span>
                     }
                  >
                     <Select
                        value={grouping}
                        onValueChange={(value) => setGrouping(value as ProjectsGrouping)}
                     >
                        <SelectTrigger className="h-7 w-36 text-xs">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {GROUPINGS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                 {option.label}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </OptionRow>
                  <OptionRow
                     label={
                        <span className="flex items-center gap-2">
                           <ArrowUpNarrowWide className="size-4 text-muted-foreground" />
                           Ordering
                        </span>
                     }
                  >
                     <Select
                        value={ordering}
                        onValueChange={(value) => setOrdering(value as ProjectsOrdering)}
                     >
                        <SelectTrigger className="h-7 w-36 text-xs">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {ORDERINGS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                 {option.label}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </OptionRow>
               </div>
            </div>

            <div className="flex h-[49px] items-center border-t px-4">
               <OptionRow label="Show closed projects">
                  <Select
                     value={closedProjects}
                     onValueChange={(value) => setClosedProjects(value as 'all' | 'hide')}
                  >
                     <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="hide">Hide closed</SelectItem>
                     </SelectContent>
                  </Select>
               </OptionRow>
            </div>

            <div className="flex min-h-[221px] flex-col border-t px-4 py-2">
               {/* Per-view options */}
               <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium">
                     {viewType === 'timeline'
                        ? 'Timeline options'
                        : viewType === 'board'
                          ? 'Board options'
                          : 'List options'}
                  </span>
                  {viewType === 'timeline' && (
                     <>
                        <OptionRow label="Show project list">
                           <Switch checked={showProjectList} onCheckedChange={setShowProjectList} />
                        </OptionRow>
                        <OptionRow label="Show week numbers">
                           <Switch checked={showWeekNumbers} onCheckedChange={setShowWeekNumbers} />
                        </OptionRow>
                     </>
                  )}
                  {viewType === 'board' && (
                     <OptionRow label="Show empty columns">
                        <Switch checked={showEmptyGroups} onCheckedChange={setShowEmptyGroups} />
                     </OptionRow>
                  )}
               </div>

               {/* Display properties */}
               <div className="mt-3 flex flex-col gap-2">
                  <span className="text-xs text-muted-foreground">Display properties</span>
                  <div className="flex flex-wrap gap-1">
                     {PROJECT_DISPLAY_PROPERTIES.map((property) => {
                        const enabled = displayProperties[property.key];
                        return (
                           <button
                              key={property.key}
                              type="button"
                              onClick={() => toggleDisplayProperty(property.key)}
                              className={cn(
                                 'h-6 rounded-md border px-2 text-xs transition-colors',
                                 enabled
                                    ? 'bg-accent text-foreground border-border'
                                    : 'border-border/60 text-muted-foreground hover:text-foreground'
                              )}
                           >
                              {property.label}
                           </button>
                        );
                     })}
                  </div>
               </div>
               {!isDefault && (
                  <button
                     type="button"
                     onClick={resetDisplaySettings}
                     className="mt-3 self-start pb-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                     Reset
                  </button>
               )}
            </div>
         </PopoverContent>
      </Popover>
   );
}
