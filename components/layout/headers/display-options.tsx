'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
   CompletedIssuesFilter,
   DISPLAY_PROPERTIES,
   GroupingKey,
   OrderingKey,
   useDisplaySettings,
} from '@/store/display-settings-store';
import { useViewStore } from '@/store/view-store';
import {
   ArrowUpNarrowWide,
   ArrowUpDown,
   LayoutGrid,
   LayoutList,
   SlidersHorizontal,
} from 'lucide-react';

const GROUPINGS: { value: GroupingKey; label: string }[] = [
   { value: 'status', label: 'Status' },
   { value: 'assignee', label: 'Assignee' },
   { value: 'priority', label: 'Priority' },
   { value: 'project', label: 'Project' },
   { value: 'label', label: 'Label' },
   { value: 'none', label: 'No grouping' },
];

const ORDERINGS: { value: OrderingKey; label: string }[] = [
   { value: 'priority', label: 'Priority' },
   { value: 'manual', label: 'Manual' },
   { value: 'created', label: 'Created' },
   { value: 'dueDate', label: 'Due date' },
   { value: 'title', label: 'Title' },
];

/**
 * Linear-style "Display" popover: list/board switch, grouping, ordering,
 * completed-issue visibility, list options and display property chips.
 */
export function DisplayOptions() {
   const { viewType, setViewType } = useViewStore();
   const {
      grouping,
      ordering,
      orderCompletedByRecency,
      completedIssues,
      showEmptyGroups,
      displayProperties,
      setGrouping,
      setOrdering,
      setOrderCompletedByRecency,
      setCompletedIssues,
      setShowEmptyGroups,
      toggleDisplayProperty,
      resetDisplaySettings,
   } = useDisplaySettings();

   const isDefault =
      grouping === 'status' &&
      ordering === 'priority' &&
      completedIssues === 'all' &&
      !showEmptyGroups;

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button className="relative gap-1" size="xs" variant="secondary">
               <SlidersHorizontal className="size-4" />
               Display
               {(!isDefault || viewType === 'grid') && (
                  <span className="absolute right-0 top-0 size-2 rounded-full bg-primary" />
               )}
            </Button>
         </PopoverTrigger>
         <PopoverContent
            className="min-h-[541px] w-[302px] rounded-xl border-[var(--popover-border)] bg-popover p-0 pt-2 shadow-[var(--popover-shadow)]"
            align="end"
            sideOffset={5}
            style={{ boxShadow: 'var(--popover-shadow)' }}
         >
            {/* List / Board switch */}
            <div className="h-[46px] px-4 pb-2 pt-1.5">
               <div className="grid h-8 grid-cols-2 gap-0.5 rounded-md">
                  <button
                     onClick={() => setViewType('list')}
                     className={cn(
                        'm-0.5 flex h-7 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors',
                        viewType === 'list'
                           ? 'bg-[var(--segmented-control-active)]'
                           : 'text-muted-foreground'
                     )}
                  >
                     <LayoutList className="size-3.5" />
                     List
                  </button>
                  <button
                     onClick={() => setViewType('grid')}
                     className={cn(
                        'm-0.5 flex h-7 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors',
                        viewType === 'grid'
                           ? 'bg-[var(--segmented-control-active)]'
                           : 'text-muted-foreground'
                     )}
                  >
                     <LayoutGrid className="size-3.5" />
                     Board
                  </button>
               </div>
            </div>

            {/* Grouping & ordering */}
            <div className="flex h-36 flex-col gap-2.5 px-4 pb-2 pt-0.5">
               <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <ArrowUpDown className="size-3.5" />
                     {viewType === 'grid' ? 'Columns' : 'Grouping'}
                  </span>
                  <Select value={grouping} onValueChange={(v) => setGrouping(v as GroupingKey)}>
                     <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {GROUPINGS.map((option) => (
                           <SelectItem key={option.value} value={option.value} className="text-xs">
                              {option.label}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>

               <div className="flex items-center justify-between gap-2">
                  <span className="pl-5 text-xs text-muted-foreground">
                     {viewType === 'grid' ? 'Rows' : 'Sub-grouping'}
                  </span>
                  <Select value="none" disabled>
                     <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue placeholder="No grouping" />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="none" className="text-xs">
                           No grouping
                        </SelectItem>
                     </SelectContent>
                  </Select>
               </div>

               <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <ArrowUpNarrowWide className="size-3.5" />
                     Ordering
                  </span>
                  <Select value={ordering} onValueChange={(v) => setOrdering(v as OrderingKey)}>
                     <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {ORDERINGS.map((option) => (
                           <SelectItem key={option.value} value={option.value} className="text-xs">
                              {option.label}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>

               <div className="flex items-center justify-between">
                  <Label
                     htmlFor="order-completed-recency"
                     className="text-xs text-muted-foreground font-normal"
                  >
                     Order completed by recency
                  </Label>
                  <Switch
                     id="order-completed-recency"
                     checked={orderCompletedByRecency}
                     onCheckedChange={setOrderCompletedByRecency}
                  />
               </div>
            </div>

            <div className="flex h-[81px] flex-col gap-3 border-t px-4 py-2.5">
               <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Completed issues</span>
                  <Select
                     value={completedIssues}
                     onValueChange={(v) => setCompletedIssues(v as CompletedIssuesFilter)}
                  >
                     <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="all" className="text-xs">
                           All
                        </SelectItem>
                        <SelectItem value="none" className="text-xs">
                           None
                        </SelectItem>
                     </SelectContent>
                  </Select>
               </div>
            </div>

            <div className="flex h-56 flex-col gap-2.5 border-t px-4 py-3">
               <span className="text-xs font-medium">
                  {viewType === 'grid' ? 'Board options' : 'List options'}
               </span>
               <div className="flex items-center justify-between">
                  <Label
                     htmlFor="show-empty-groups"
                     className="text-xs text-muted-foreground font-normal"
                  >
                     {viewType === 'grid' ? 'Show empty columns' : 'Show empty groups'}
                  </Label>
                  <Switch
                     id="show-empty-groups"
                     checked={showEmptyGroups}
                     onCheckedChange={setShowEmptyGroups}
                  />
               </div>

               <span className="text-xs text-muted-foreground mt-1">Display properties</span>
               <div className="flex flex-wrap gap-1.5">
                  {DISPLAY_PROPERTIES.map((property) => (
                     <button
                        key={property.key}
                        onClick={() => toggleDisplayProperty(property.key)}
                        className={cn(
                           'px-2 h-6 rounded-md text-xs border transition-colors',
                           displayProperties[property.key]
                              ? 'bg-accent border-border text-foreground'
                              : 'border-transparent bg-accent/40 text-muted-foreground hover:text-foreground'
                        )}
                     >
                        {property.label}
                     </button>
                  ))}
               </div>
            </div>

            <div className="flex h-9 items-center justify-between border-t px-4">
               <button
                  onClick={resetDisplaySettings}
                  className="text-xs text-muted-foreground hover:text-foreground"
               >
                  Reset
               </button>
            </div>
         </PopoverContent>
      </Popover>
   );
}
