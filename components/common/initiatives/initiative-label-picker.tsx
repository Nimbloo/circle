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
import { labelColor } from '@/components/common/palette';
import { EmptyValue, PropertyButton } from '@/components/common/projects/project-property-fields';

export function InitiativeLabelPicker({
   labels,
   value,
   onChange,
   compact = false,
   ghost = false,
}: {
   labels: LabelInterface[];
   value: string[];
   onChange: (value: string[]) => void;
   compact?: boolean;
   /** Valor da linha de propriedade (botão fantasma com chips) em vez do chip com borda. */
   ghost?: boolean;
}) {
   const selected = labels.filter((label) => value.includes(label.id));
   const toggle = (labelId: string) =>
      onChange(
         value.includes(labelId) ? value.filter((id) => id !== labelId) : [...value, labelId]
      );

   return (
      <Popover>
         <PopoverTrigger asChild>
            {ghost ? (
               <PropertyButton aria-label="Change labels">
                  {selected.length === 0 ? (
                     <EmptyValue icon={Tag}>Add label</EmptyValue>
                  ) : (
                     <span className="flex min-w-0 flex-wrap items-center gap-1 py-1">
                        {selected.map((label) => (
                           <span
                              key={label.id}
                              className="inline-flex max-w-40 items-center gap-1 rounded-full border px-2 py-px text-xs"
                           >
                              <span
                                 className="size-2 shrink-0 rounded-full"
                                 style={{ backgroundColor: labelColor(label.color) }}
                              />
                              <span className="truncate">{label.name}</span>
                           </span>
                        ))}
                     </span>
                  )}
               </PropertyButton>
            ) : (
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
            )}
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
                                 backgroundColor: labelColor(label.color),
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
