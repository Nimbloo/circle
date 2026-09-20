'use client';

import * as React from 'react';
import { format, isSameDay } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatPlanDay } from './format-day';

interface DatePickerProps {
   date: Date | undefined;
   onDateChange?: (date: Date | undefined) => void;
}

export function DatePicker({ date, onDateChange }: DatePickerProps) {
   const [open, setOpen] = React.useState<boolean>(false);
   // Deriva do prop — reverte junto com o rollback e reflete mudança externa.
   const selectedDate = date;

   const handleDateSelect = (next: Date | undefined) => {
      setOpen(false);
      const same = next && selectedDate ? isSameDay(next, selectedDate) : next === selectedDate;
      if (!same) onDateChange?.(next);
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               variant="ghost"
               className="h-7 px-2 justify-start text-left font-normal"
               size="sm"
               aria-label="Set target date"
            >
               <CalendarIcon className="h-4 w-4 md:mr-0.5" />
               {selectedDate ? (
                  <span className="text-xs hidden xl:inline mt-[1px] truncate">
                     {formatPlanDay(format(selectedDate, 'yyyy-MM-dd'))}
                  </span>
               ) : (
                  <span className="text-xs text-muted-foreground hidden xl:inline mt-[1px]">
                     No date
                  </span>
               )}
            </Button>
         </PopoverTrigger>
         <PopoverContent className="w-auto p-0" align="start">
            <Calendar
               mode="single"
               selected={selectedDate}
               onSelect={handleDateSelect}
               initialFocus
            />
         </PopoverContent>
      </Popover>
   );
}
