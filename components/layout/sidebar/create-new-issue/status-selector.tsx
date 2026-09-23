'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Status } from '@/data/status';
import { useStatuses } from '@/store/catalog-store';
import { useId, useState } from 'react';
import { StatusOptions } from '@/components/common/issues/property-options';

interface StatusSelectorProps {
   status: Status;
   /** Time selecionado no form — escopa a contagem do seletor (senão conta todos os times). */
   teamId?: string;
   onChange: (status: Status) => void;
}

/** Seletor de status do modal de criação: trigger próprio, lista compartilhada (R1). */
export function StatusSelector({ status, teamId, onChange }: StatusSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const allStatus = useStatuses();
   // Deriva do prop (o modal é o dono do valor).
   const selected = allStatus.find((s) => s.id === status.id) ?? status;

   const handleStatusChange = (statusId: string) => {
      setOpen(false);
      const newStatus = allStatus.find((s) => s.id === statusId);
      if (newStatus) onChange(newStatus);
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
                  <selected.icon />
                  <span>{selected.name}</span>
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <StatusOptions value={status.id} teamId={teamId} onSelect={handleStatusChange} />
            </PopoverContent>
         </Popover>
      </div>
   );
}
