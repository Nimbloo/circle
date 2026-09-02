'use client';

import { CheckIcon, Tag } from 'lucide-react';
import type { LabelInterface } from '@/data/labels';
import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const LABEL_COLOR: Record<string, string> = {
   purple: 'var(--primary)',
   indigo: 'var(--primary)',
   red: 'var(--destructive)',
   green: 'var(--review-open)',
   yellow: 'var(--cycle-started)',
   orange: 'var(--chart-4)',
   pink: 'var(--chart-5)',
   blue: 'var(--chart-3)',
   cyan: 'var(--chart-2)',
   teal: 'var(--chart-2)',
   gray: 'var(--muted-foreground)',
};

export function InitiativeLabelPicker({
   labels,
   value,
   onChange,
   compact = false,
}: {
   labels: LabelInterface[];
   value: string[];
   onChange: (value: string[]) => void;
   compact?: boolean;
}) {
   const selected = labels.filter((label) => value.includes(label.id));
   const toggle = (labelId: string) =>
      onChange(
         value.includes(labelId) ? value.filter((id) => id !== labelId) : [...value, labelId]
      );

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button
               type="button"
               size={compact ? 'xxs' : 'xs'}
               variant="outline"
               className="max-w-44 gap-1.5 bg-transparent px-2 text-xs font-normal text-muted-foreground"
               aria-label="Change labels"
            >
               <Tag className="size-3.5" />
               <span className="truncate">
                  {selected.length === 0
                     ? 'Labels'
                     : selected.length === 1
                       ? selected[0].name
                       : `${selected[0].name} +${selected.length - 1}`}
               </span>
            </Button>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-60 p-0">
            <Command>
               <CommandInput placeholder="Add labels…" />
               <CommandList>
                  <CommandEmpty>No labels found.</CommandEmpty>
                  <CommandGroup>
                     {labels.map((label) => (
                        <CommandItem key={label.id} onSelect={() => toggle(label.id)}>
                           <span
                              className="size-2.5 rounded-full"
                              style={{
                                 backgroundColor:
                                    LABEL_COLOR[label.color] ?? 'var(--muted-foreground)',
                              }}
                           />
                           {label.name}
                           {value.includes(label.id) && <CheckIcon className="ml-auto size-3.5" />}
                        </CommandItem>
                     ))}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}
