'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIssuesStore } from '@/store/issues-store';
import { Priority } from '@/data/priorities';
import { usePriorities } from '@/store/catalog-store';
import { useId, useState, type ReactNode } from 'react';
import { PriorityOptions } from './property-options';

interface PrioritySelectorProps {
   priority: Priority;
   issueId?: string;
   /** Exibe o nome da prioridade dentro do trigger (linha inteira clicável — padrão Linear). */
   showName?: boolean;
   /** Trigger de 24px usado na linha de propriedades dos cards do board. */
   compact?: boolean;
   /** Trigger customizado (linha de propriedade do detalhe); default: botão com o ícone. */
   children?: ReactNode;
}

export function PrioritySelector({
   priority,
   issueId,
   showName = false,
   compact = false,
   children,
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
               {children ?? (
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
                     aria-label={
                        showName ? undefined : `Change priority: ${priority?.name ?? 'none'}`
                     }
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
               )}
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
