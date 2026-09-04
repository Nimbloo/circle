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
import { ZOOM_LEVELS, type TimelineZoom } from '@/lib/timeline-scale';
import {
   ROADMAP_DISPLAY_DEFAULTS,
   type RoadmapOrdering,
   useRoadmapDisplayStore,
} from '@/store/roadmap-display-store';
import { ArrowUpNarrowWide, SlidersHorizontal, ZoomIn } from 'lucide-react';

const ORDERINGS: { value: RoadmapOrdering; label: string }[] = [
   { value: 'start-date', label: 'Start date' },
   { value: 'target-date', label: 'Target date' },
   { value: 'title', label: 'Title' },
];

function OptionRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
   return (
      <div className="flex h-7 w-full items-center justify-between gap-3">
         <span className="text-xs text-muted-foreground">{label}</span>
         {children}
      </div>
   );
}

/** Popover "Display" do Roadmap, no padrão do de Projects. */
export function RoadmapDisplayOptions() {
   const {
      zoom,
      ordering,
      showCompleted,
      showDependencies,
      showMilestones,
      showProjectList,
      setZoom,
      setOrdering,
      setShowCompleted,
      setShowDependencies,
      setShowMilestones,
      setShowProjectList,
      resetRoadmapDisplay,
   } = useRoadmapDisplayStore();

   const isDefault =
      zoom === ROADMAP_DISPLAY_DEFAULTS.zoom &&
      ordering === ROADMAP_DISPLAY_DEFAULTS.ordering &&
      showCompleted === ROADMAP_DISPLAY_DEFAULTS.showCompleted &&
      showDependencies === ROADMAP_DISPLAY_DEFAULTS.showDependencies &&
      showMilestones === ROADMAP_DISPLAY_DEFAULTS.showMilestones &&
      showProjectList === ROADMAP_DISPLAY_DEFAULTS.showProjectList;

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
            className="w-[332px] rounded-xl border-[var(--popover-border)] bg-popover p-0 pt-2"
            style={{ boxShadow: 'var(--popover-shadow)' }}
         >
            <div className="flex flex-col gap-1.5 px-4 pb-3 pt-2">
               <OptionRow
                  label={
                     <span className="flex items-center gap-2">
                        <ZoomIn className="size-4 text-muted-foreground" />
                        Zoom
                     </span>
                  }
               >
                  <Select value={zoom} onValueChange={(value) => setZoom(value as TimelineZoom)}>
                     <SelectTrigger className="h-7 w-36 text-xs" aria-label="Zoom">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {ZOOM_LEVELS.map((level) => (
                           <SelectItem key={level.id} value={level.id}>
                              {level.label}
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
                     onValueChange={(value) => setOrdering(value as RoadmapOrdering)}
                  >
                     <SelectTrigger className="h-7 w-36 text-xs" aria-label="Ordering">
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

            <div className="flex flex-col gap-1.5 border-t px-4 py-2">
               <span className="text-xs font-medium">Roadmap options</span>
               <OptionRow label="Show completed">
                  <Switch
                     checked={showCompleted}
                     onCheckedChange={setShowCompleted}
                     aria-label="Show completed"
                  />
               </OptionRow>
               <OptionRow label="Show dependencies">
                  <Switch
                     checked={showDependencies}
                     onCheckedChange={setShowDependencies}
                     aria-label="Show dependencies"
                  />
               </OptionRow>
               <OptionRow label="Show milestones">
                  <Switch
                     checked={showMilestones}
                     onCheckedChange={setShowMilestones}
                     aria-label="Show milestones"
                  />
               </OptionRow>
               <OptionRow label="Show project list">
                  <Switch
                     checked={showProjectList}
                     onCheckedChange={setShowProjectList}
                     aria-label="Show project list"
                  />
               </OptionRow>
               {!isDefault && (
                  <button
                     type="button"
                     onClick={resetRoadmapDisplay}
                     className="mt-1 self-start pb-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                     Reset
                  </button>
               )}
            </div>
         </PopoverContent>
      </Popover>
   );
}
