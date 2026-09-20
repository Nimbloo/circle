'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Priority } from '@/data/priorities';
import { usePriorities } from '@/store/catalog-store';
import { useId, useState } from 'react';
import { PriorityOptions } from '@/components/common/issues/property-options';

interface PrioritySelectorProps {
   priority: Priority;
   onChange: (priority: Priority) => void;
}

/** Seletor de prioridade do modal de criação: trigger próprio, lista compartilhada (R1). */
export function PrioritySelector({ priority, onChange }: PrioritySelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const priorities = usePriorities();
   const selected = priorities.find((p) => p.id === priority.id) ?? priority;

   const handlePriorityChange = (priorityId: string) => {
      setOpen(false);
      const newPriority = priorities.find((p) => p.id === priorityId);
      if (newPriority) onChange(newPriority);
   };

   return (
      <div className="*:not-first:mt-2">
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className="flex items-center justify-center"
                  size="xs"
                  variant="secondary"
                  role="combobox"
                  aria-expanded={open}
               >
                  <selected.icon className="text-muted-foreground size-4" />
                  <span>{selected.name}</span>
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <PriorityOptions value={priority.id} onSelect={handlePriorityChange} />
            </PopoverContent>
         </Popover>
      </div>
   );
}
