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
import { cn } from '@/lib/utils';
import {
   TEAM_DISPLAY_PROPERTIES,
   TeamsOrdering,
   useTeamsDisplayStore,
} from '@/store/teams-display-store';
import { SlidersHorizontal } from 'lucide-react';

const ORDERINGS: { value: TeamsOrdering; label: string }[] = [
   { value: 'name', label: 'Name' },
   { value: 'members', label: 'Members' },
   { value: 'projects', label: 'Projects' },
];

/** Linear-style Display popover for the Teams page. */
export function TeamsDisplayOptions() {
   const { ordering, displayProperties, setOrdering, toggleDisplayProperty } =
      useTeamsDisplayStore();

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
            className="w-[302px] rounded-xl border-[var(--popover-border)] bg-popover p-0 pt-2"
            style={{ boxShadow: 'var(--popover-shadow)' }}
         >
            <div className="flex h-12 items-center justify-between px-4 py-2">
               <span className="w-20 text-xs font-medium leading-[normal] text-muted-foreground">
                  Ordering
               </span>
               <span className="flex flex-1 justify-end">
                  <Select
                     value={ordering}
                     onValueChange={(value) => setOrdering(value as TeamsOrdering)}
                  >
                     <SelectTrigger className="relative h-6 w-auto min-w-[63px] rounded-lg border-transparent px-2 py-px pr-[18px] text-xs leading-[normal] shadow-none [&_svg]:absolute [&_svg]:right-2 [&_svg]:size-2.5">
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
               </span>
            </div>

            <div className="flex flex-col border-t px-4 py-2">
               <span className="mb-1 mt-2 text-xs font-medium leading-[normal] text-muted-foreground">
                  Display properties
               </span>
               <div className="mt-2 flex flex-wrap gap-px">
                  {TEAM_DISPLAY_PROPERTIES.map((property) => {
                     const enabled = displayProperties[property.key];
                     return (
                        <button
                           key={property.key}
                           type="button"
                           onClick={() => toggleDisplayProperty(property.key)}
                           className={cn(
                              'mr-1 mb-1 h-6 rounded-full border border-transparent px-2 text-xs font-medium leading-[normal] transition-colors',
                              enabled
                                 ? 'bg-accent text-foreground'
                                 : 'bg-muted/40 text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                           )}
                        >
                           {property.label}
                        </button>
                     );
                  })}
               </div>
            </div>
         </PopoverContent>
      </Popover>
   );
}
