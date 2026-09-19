'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIssuesStore } from '@/store/issues-store';
import { Status } from '@/data/status';
import { useStatuses } from '@/store/catalog-store';
import { useId, useState } from 'react';
import { renderStatusIcon } from '@/lib/status-utils';
import { StatusOptions } from './property-options';

interface StatusSelectorProps {
   status: Status;
   issueId: string;
   /** Exibe o nome do status dentro do trigger (linha inteira clicável — padrão Linear). */
   showName?: boolean;
   /** Trigger de 16px usado dentro dos cards compactos do board. */
   compact?: boolean;
}

export function StatusSelector({
   status,
   issueId,
   showName = false,
   compact = false,
}: StatusSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   // Deriva do prop (store) — sem estado local otimista, reverte junto com o rollback.
   const value = status.id;

   const allStatus = useStatuses();
   const updateIssueStatus = useIssuesStore((s) => s.updateIssueStatus);

   const handleStatusChange = (statusId: string) => {
      setOpen(false);

      if (issueId) {
         const newStatus = allStatus.find((s) => s.id === statusId);
         if (newStatus) {
            // O store já faz rollback + toast e re-lança; aqui não há mais o que tratar.
            updateIssueStatus(issueId, newStatus).catch(() => undefined);
         }
      }
   };

   return (
      <div className={compact ? 'h-3.5 leading-none' : '*:not-first:mt-2'}>
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className={
                     showName
                        ? 'h-7 gap-2 px-1.5 justify-start'
                        : compact
                          ? 'size-3.5 p-0'
                          : 'size-7 flex items-center justify-center'
                  }
                  size={showName ? 'sm' : 'icon'}
                  variant="ghost"
                  role="combobox"
                  aria-expanded={open}
                  aria-label="Set status"
               >
                  {renderStatusIcon(value)}
                  {showName && <span className="text-sm font-normal">{status.name}</span>}
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <StatusOptions value={value} onSelect={handleStatusChange} />
            </PopoverContent>
         </Popover>
      </div>
   );
}
