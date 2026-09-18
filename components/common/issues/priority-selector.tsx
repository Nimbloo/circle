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
import type { Issue } from '@/data/issues';
import { usePriorities } from '@/store/catalog-store';
import { CheckIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useIssueCounts } from './issue-counts';

const byPriority = (issue: Issue) => issue.priority.id;

/** Opções do popover — montadas só com ele aberto, então só aí assinam as issues. */
function PriorityOptions({
   value,
   onSelect,
}: {
   value: string;
   onSelect: (priorityId: string) => void;
}) {
   const priorities = usePriorities();
   const counts = useIssueCounts(byPriority);

   return (
      <Command>
         <CommandInput placeholder="Set priority..." />
         <CommandList>
            <CommandEmpty>No priority found.</CommandEmpty>
            <CommandGroup>
               {priorities.map((item) => (
                  <CommandItem
                     key={item.id}
                     value={item.id}
                     onSelect={onSelect}
                     className="flex items-center justify-between"
                  >
                     <div className="flex items-center gap-2">
                        <item.icon className="text-muted-foreground size-4" />
                        {item.name}
                     </div>
                     {value === item.id && <CheckIcon size={16} className="ml-auto" />}
                     <span className="text-muted-foreground text-xs">
                        {counts.get(item.id) ?? 0}
                     </span>
                  </CommandItem>
               ))}
            </CommandGroup>
         </CommandList>
      </Command>
   );
}

interface PrioritySelectorProps {
   priority: Priority;
   issueId?: string;
   /** Exibe o nome da prioridade dentro do trigger (linha inteira clicável — padrão Linear). */
   showName?: boolean;
   /** Trigger de 24px usado na linha de propriedades dos cards do board. */
   compact?: boolean;
}

export function PrioritySelector({
   priority,
   issueId,
   showName = false,
   compact = false,
}: PrioritySelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   // Deriva do prop (store) — sem estado local otimista, reverte junto com o rollback.
   const value = priority.id;

   const priorities = usePriorities();
   const updateIssuePriority = useIssuesStore((s) => s.updateIssuePriority);

   const handlePriorityChange = (priorityId: string) => {
      setOpen(false);

      if (issueId) {
         const newPriority = priorities.find((p) => p.id === priorityId);
         if (newPriority) {
            // O store já faz rollback + toast e re-lança; aqui não há mais o que tratar.
            updateIssuePriority(issueId, newPriority).catch(() => undefined);
         }
      }
   };

   return (
      <div className={compact ? 'h-6 leading-none' : '*:not-first:mt-2'}>
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className={
                     showName
                        ? 'h-7 gap-2 px-1.5 justify-start'
                        : compact
                          ? 'h-6 w-[25px] px-[4.5px]'
                          : 'size-7 flex items-center justify-center'
                  }
                  size={showName ? 'sm' : 'icon'}
                  variant="ghost"
                  role="combobox"
                  aria-expanded={open}
                  aria-label={showName ? undefined : `Change priority: ${priority?.name ?? 'none'}`}
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
               <PriorityOptions value={value} onSelect={handlePriorityChange} />
            </PopoverContent>
         </Popover>
      </div>
   );
}
