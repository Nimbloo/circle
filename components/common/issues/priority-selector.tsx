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
import { useIssuesStore } from '@/store/issues-store';
import { Priority } from '@/data/priorities';
import { usePriorities } from '@/store/catalog-store';
import { CheckIcon } from 'lucide-react';
import { useId, useState } from 'react';

interface PrioritySelectorProps {
   priority: Priority;
   issueId?: string;
   /** Exibe o nome da prioridade dentro do trigger (linha inteira clicável — padrão Linear). */
   showName?: boolean;
}

export function PrioritySelector({ priority, issueId, showName = false }: PrioritySelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   // Deriva do prop (store) — sem estado local otimista, reverte junto com o rollback.
   const value = priority.id;

   const priorities = usePriorities();
   // Conta derivada da fatia assinada: assinar `filterByPriority` (funcao, referencia
   // estavel) deixaria o contador do dropdown parado quando as issues mudam.
   const allIssues = useIssuesStore((s) => s.issues);
   const updateIssuePriority = useIssuesStore((s) => s.updateIssuePriority);

   const handlePriorityChange = (priorityId: string) => {
      setOpen(false);

      if (issueId) {
         const newPriority = priorities.find((p) => p.id === priorityId);
         if (newPriority) {
            updateIssuePriority(issueId, newPriority);
         }
      }
   };

   return (
      <div className="*:not-first:mt-2">
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className={
                     showName
                        ? 'h-7 gap-2 px-1.5 justify-start'
                        : 'size-7 flex items-center justify-center'
                  }
                  size={showName ? 'sm' : 'icon'}
                  variant="ghost"
                  role="combobox"
                  aria-expanded={open}
               >
                  {(() => {
                     const selectedItem = priorities.find((item) => item.id === value);
                     if (selectedItem) {
                        const Icon = selectedItem.icon;
                        return <Icon className="text-muted-foreground size-4" />;
                     }
                     return null;
                  })()}
                  {showName && <span className="text-sm font-normal">{priority.name}</span>}
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <Command>
                  <CommandInput placeholder="Set priority..." />
                  <CommandList>
                     <CommandEmpty>No priority found.</CommandEmpty>
                     <CommandGroup>
                        {priorities.map((item) => (
                           <CommandItem
                              key={item.id}
                              value={item.id}
                              onSelect={handlePriorityChange}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <item.icon className="text-muted-foreground size-4" />
                                 {item.name}
                              </div>
                              {value === item.id && <CheckIcon size={16} className="ml-auto" />}
                              <span className="text-muted-foreground text-xs">
                                 {allIssues.filter((i) => i.priority.id === item.id).length}
                              </span>
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>
      </div>
   );
}
