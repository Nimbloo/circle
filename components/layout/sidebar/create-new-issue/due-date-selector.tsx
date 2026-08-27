'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parseISO } from 'date-fns';
import { CalendarClock, X } from 'lucide-react';
import { useId, useState } from 'react';

interface DueDateSelectorProps {
   /** Data no formato YYYY-MM-DD (ou undefined). */
   dueDate: string | undefined;
   onChange: (dueDate: string | undefined) => void;
}

/** Chip de due date no modal de criação (padrão Linear): calendário em popover. */
export function DueDateSelector({ dueDate, onChange }: DueDateSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState(false);
   const label = dueDate ? format(parseISO(dueDate), 'MMM d') : 'Due date';

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               id={id}
               size="xs"
               variant="secondary"
               role="combobox"
               aria-expanded={open}
               className="flex items-center justify-center gap-1"
            >
               <CalendarClock className="text-muted-foreground size-4" />
               <span>{label}</span>
            </Button>
         </PopoverTrigger>
         <PopoverContent className="w-auto p-0" align="start">
            <Calendar
               mode="single"
               selected={dueDate ? parseISO(dueDate) : undefined}
               onSelect={(date) => {
                  onChange(date ? format(date, 'yyyy-MM-dd') : undefined);
                  setOpen(false);
               }}
               initialFocus
            />
            {dueDate && (
               <button
                  type="button"
                  onClick={() => {
                     onChange(undefined);
                     setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground border-t"
               >
                  <X className="size-3.5" /> Clear due date
               </button>
            )}
         </PopoverContent>
      </Popover>
   );
}
