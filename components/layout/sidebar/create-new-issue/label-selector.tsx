'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LabelInterface } from '@/data/labels';
import { TagIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LabelOptions } from '@/components/common/issues/property-options';
import { labelColor } from '@/components/common/palette';

interface LabelSelectorProps {
   selectedLabels: LabelInterface[];
   onChange: (labels: LabelInterface[]) => void;
   /** Trigger customizado (badges da linha de issue); default: botão com os pontos. */
   children?: ReactNode;
}

export function LabelSelector({ selectedLabels, onChange, children }: LabelSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);

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
                                 style={{ backgroundColor: labelColor(label.color) }}
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
               <LabelOptions selected={selectedLabels} onToggle={handleLabelToggle} />
            </PopoverContent>
         </Popover>
      </div>
   );
}
