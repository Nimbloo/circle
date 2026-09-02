'use client';

import { useState } from 'react';
import { addYears, format } from 'date-fns';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type PeriodMode = 'day' | 'month' | 'quarter' | 'half-year' | 'year';
const MODES: { key: PeriodMode; label: string }[] = [
   { key: 'day', label: 'Day' },
   { key: 'month', label: 'Month' },
   { key: 'quarter', label: 'Quarter' },
   { key: 'half-year', label: 'Half-year' },
   { key: 'year', label: 'Year' },
];

export function InitiativeTargetPicker({
   value,
   onChange,
   compact = false,
}: {
   value: string;
   onChange: (value: string) => void;
   compact?: boolean;
}) {
   const [open, setOpen] = useState(false);
   const [query, setQuery] = useState('');
   const [mode, setMode] = useState<PeriodMode>('quarter');
   const [year, setYear] = useState(new Date().getFullYear());

   const choose = (next: string) => {
      onChange(next);
      setOpen(false);
      setQuery('');
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               type="button"
               size={compact ? 'xxs' : 'xs'}
               variant="outline"
               className="gap-1.5 bg-transparent px-2 text-xs font-normal text-muted-foreground"
               aria-label="Change initiative target date"
            >
               <CalendarClock className="size-3.5" />
               {value || 'Target date'}
            </Button>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-[336px] p-0">
            <div className="border-b p-2">
               <Input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                     if (event.key === 'Enter' && query.trim()) choose(query.trim());
                  }}
                  placeholder="Try: May 2027, Q4, 20/05/2027"
                  aria-label="Initiative target period"
                  className="h-8"
               />
            </div>
            <div className="flex gap-1 border-b px-2 pt-1">
               {MODES.map((candidate) => (
                  <button
                     key={candidate.key}
                     type="button"
                     onClick={() => setMode(candidate.key)}
                     className={cn(
                        'h-8 border-b-2 px-2 text-[11px] font-medium transition-colors',
                        mode === candidate.key
                           ? 'border-primary text-foreground'
                           : 'border-transparent text-muted-foreground hover:text-foreground'
                     )}
                  >
                     {candidate.label}
                  </button>
               ))}
            </div>
            {mode === 'day' ? (
               <Calendar
                  mode="single"
                  onSelect={(date) => date && choose(format(date, 'MMM d, yyyy'))}
               />
            ) : (
               <div className="p-3">
                  <div className="mb-3 flex items-center justify-between">
                     <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => setYear((current) => current - 1)}
                        aria-label="Previous year"
                     >
                        <ChevronLeft className="size-4" />
                     </Button>
                     <span className="text-sm font-medium">{year}</span>
                     <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => setYear((current) => current + 1)}
                        aria-label="Next year"
                     >
                        <ChevronRight className="size-4" />
                     </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                     {mode === 'month' &&
                        Array.from({ length: 12 }, (_, month) => {
                           const label = format(new Date(year, month, 1), 'MMM');
                           return (
                              <PeriodButton
                                 key={label}
                                 label={label}
                                 onClick={() => choose(`${label} ${year}`)}
                              />
                           );
                        })}
                     {mode === 'quarter' &&
                        [1, 2, 3, 4].map((quarter) => (
                           <PeriodButton
                              key={quarter}
                              label={`Q${quarter}`}
                              onClick={() => choose(`Q${quarter} ${year}`)}
                           />
                        ))}
                     {mode === 'half-year' &&
                        [1, 2].map((half) => (
                           <PeriodButton
                              key={half}
                              label={`H${half}`}
                              onClick={() => choose(`H${half} ${year}`)}
                           />
                        ))}
                     {mode === 'year' &&
                        Array.from({ length: 9 }, (_, index) =>
                           addYears(new Date(year - 4, 0, 1), index).getFullYear()
                        ).map((candidate) => (
                           <PeriodButton
                              key={candidate}
                              label={String(candidate)}
                              onClick={() => choose(String(candidate))}
                           />
                        ))}
                  </div>
               </div>
            )}
            {value && (
               <div className="border-t p-2">
                  <Button
                     type="button"
                     size="xs"
                     variant="ghost"
                     className="w-full justify-start"
                     onClick={() => choose('')}
                  >
                     Clear target date
                  </Button>
               </div>
            )}
         </PopoverContent>
      </Popover>
   );
}

function PeriodButton({ label, onClick }: { label: string; onClick: () => void }) {
   return (
      <button
         type="button"
         onClick={onClick}
         className="h-9 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
         {label}
      </button>
   );
}
