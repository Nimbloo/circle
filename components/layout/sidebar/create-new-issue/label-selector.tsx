'use client';

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
import { LabelInterface } from '@/data/labels';
import { useLabels } from '@/store/catalog-store';
import { CheckIcon, TagIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Issue } from '@/data/issues';
import { IssueCounts } from '@/components/common/issues/issue-counts';

const byLabel = (issue: Issue) => issue.labels.map((l) => l.id);

interface LabelSelectorProps {
   selectedLabels: LabelInterface[];
   onChange: (labels: LabelInterface[]) => void;
   /** Trigger customizado (badges da linha de issue); default: botão com os pontos. */
   children?: ReactNode;
}

export function LabelSelector({ selectedLabels, onChange, children }: LabelSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);

   const labels = useLabels();

   const handleLabelToggle = (label: LabelInterface) => {
      const isSelected = selectedLabels.some((l) => l.id === label.id);
      let newLabels: LabelInterface[];

      if (isSelected) {
         newLabels = selectedLabels.filter((l) => l.id !== label.id);
      } else {
         newLabels = [...selectedLabels, label];
      }

      onChange(newLabels);
   };

   return (
      <div className="*:not-first:mt-2">
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               {children ?? (
                  <Button
                     id={id}
                     className={cn(
                        'flex items-center justify-center',
                        selectedLabels.length === 0 && 'size-7'
                     )}
                     size={selectedLabels.length > 0 ? 'xs' : 'icon'}
                     variant="secondary"
                     role="combobox"
                     aria-expanded={open}
                     aria-label={
                        selectedLabels.length > 0
                           ? `Labels: ${selectedLabels.map((label) => label.name).join(', ')}`
                           : 'Add labels'
                     }
                  >
                     <TagIcon className="size-4" />
                     {selectedLabels.length > 0 && (
                        <div className="flex -space-x-0.5">
                           {selectedLabels.map((label) => (
                              <div
                                 key={label.id}
                                 className={`size-3 rounded-full`}
                                 style={{ backgroundColor: label.color }}
                              />
                           ))}
                        </div>
                     )}
                  </Button>
               )}
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <IssueCounts by={byLabel}>
                  {(counts) => (
                     <Command>
                        <CommandInput placeholder="Search labels..." />
                        <CommandList>
                           <CommandEmpty>No labels found.</CommandEmpty>
                           <CommandGroup>
                              {labels.map((label) => {
                                 const isSelected = selectedLabels.some((l) => l.id === label.id);
                                 return (
                                    <CommandItem
                                       key={label.id}
                                       value={label.id}
                                       onSelect={() => handleLabelToggle(label)}
                                       className="flex items-center justify-between"
                                    >
                                       <div className="flex items-center gap-2">
                                          <div
                                             className={`size-3 rounded-full`}
                                             style={{ backgroundColor: label.color }}
                                          />
                                          <span>{label.name}</span>
                                       </div>
                                       {isSelected && <CheckIcon size={16} className="ml-auto" />}
                                       <span className="text-muted-foreground text-xs">
                                          {counts.get(label.id) ?? 0}
                                       </span>
                                    </CommandItem>
                                 );
                              })}
                           </CommandGroup>
                        </CommandList>
                     </Command>
                  )}
               </IssueCounts>
            </PopoverContent>
         </Popover>
      </div>
   );
}
