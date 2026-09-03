'use client';

import { useState } from 'react';
import { addYears, format, parseISO } from 'date-fns';
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { dayLabel, targetDateFromLabel, toIsoDate } from '@/lib/initiative-period';
import { cn } from '@/lib/utils';

type PeriodMode = 'day' | 'month' | 'quarter' | 'half-year' | 'year';
const MODES: { key: PeriodMode; label: string }[] = [
   { key: 'day', label: 'Day' },
   { key: 'month', label: 'Month' },
   { key: 'quarter', label: 'Quarter' },
   { key: 'half-year', label: 'Half-year' },
   { key: 'year', label: 'Year' },
];

/** Rótulo humano do período (`target`) e a data ISO real que ele representa. */
export interface InitiativePeriodValue {
   label: string | null;
   date: string | null;
}

const formatDay = (iso: string) => format(parseISO(iso), 'MMM d, yyyy');
/** `Date` local do ISO, sem deslocar o dia pelo fuso (parseISO já faz isso). */
const toLocalDate = (iso: string) => parseISO(iso);

/**
 * Seletor de período da initiative. `kind="target"` escreve o rótulo ("Q3 2026") e a
 * data-fim derivada dele (`targetDateFromLabel`); `kind="start"` é só um dia
 * (`startDate`), sem rótulo — o texto do botão é a própria data.
 */
export function InitiativeTargetPicker({
   kind = 'target',
   label,
   date,
   onChange,
   compact = false,
}: {
   kind?: 'target' | 'start';
   label?: string | null;
   date?: string | null;
   onChange: (next: InitiativePeriodValue) => void;
   compact?: boolean;
}) {
   const [open, setOpen] = useState(false);
   const [query, setQuery] = useState('');
   const [mode, setMode] = useState<PeriodMode>(kind === 'start' ? 'day' : 'quarter');
   const [year, setYear] = useState(new Date().getFullYear());

   const isStart = kind === 'start';
   const text = isStart
      ? date
         ? formatDay(date)
         : 'Start date'
      : label || (date ? formatDay(date) : 'Target date');
   const hasValue = isStart ? Boolean(date) : Boolean(label || date);

   const commit = (next: InitiativePeriodValue) => {
      onChange(next);
      setOpen(false);
      setQuery('');
   };
   /** Rótulo de período: a data é derivada pela mesma regra do backend/backfill. */
   const chooseLabel = (next: string) => commit({ label: next, date: targetDateFromLabel(next) });
   const chooseDay = (picked: Date) => {
      const iso = toIsoDate(picked);
      commit(isStart ? { label: null, date: iso } : { label: dayLabel(iso), date: iso });
   };

   const trigger = (
      <PopoverTrigger asChild>
         <Button
            type="button"
            size={compact ? 'xxs' : 'xs'}
            variant="outline"
            className="gap-1.5 bg-transparent px-2 text-xs font-normal text-muted-foreground"
            aria-label={isStart ? 'Change initiative start date' : 'Change initiative target date'}
         >
            {isStart ? (
               <CalendarDays className="size-3.5" />
            ) : (
               <CalendarClock className="size-3.5" />
            )}
            {text}
         </Button>
      </PopoverTrigger>
   );

   return (
      <Popover open={open} onOpenChange={setOpen}>
         {/* No target o botão mostra o rótulo; a data real fica no tooltip. */}
         {!isStart && label ? (
            <Tooltip>
               <TooltipTrigger asChild>{trigger}</TooltipTrigger>
               <TooltipContent side="bottom">
                  {date ? `Ends ${formatDay(date)}` : 'No date for this label'}
               </TooltipContent>
            </Tooltip>
         ) : (
            trigger
         )}
         <PopoverContent align="start" className={cn('p-0', isStart ? 'w-auto' : 'w-[336px]')}>
            {!isStart && (
               <>
                  <div className="border-b p-2">
                     <Input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                           if (event.key === 'Enter' && query.trim()) chooseLabel(query.trim());
                        }}
                        placeholder="Try: May 2027, Q4 2026, 2027-05-20"
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
               </>
            )}
            {mode === 'day' ? (
               <Calendar
                  mode="single"
                  selected={date ? toLocalDate(date) : undefined}
                  defaultMonth={date ? toLocalDate(date) : undefined}
                  onSelect={(picked) => picked && chooseDay(picked)}
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
                           const monthLabel = format(new Date(year, month, 1), 'MMM');
                           return (
                              <PeriodButton
                                 key={monthLabel}
                                 label={monthLabel}
                                 onClick={() => chooseLabel(`${monthLabel} ${year}`)}
                              />
                           );
                        })}
                     {mode === 'quarter' &&
                        [1, 2, 3, 4].map((quarter) => (
                           <PeriodButton
                              key={quarter}
                              label={`Q${quarter}`}
                              onClick={() => chooseLabel(`Q${quarter} ${year}`)}
                           />
                        ))}
                     {mode === 'half-year' &&
                        [1, 2].map((half) => (
                           <PeriodButton
                              key={half}
                              label={`H${half}`}
                              onClick={() => chooseLabel(`H${half} ${year}`)}
                           />
                        ))}
                     {mode === 'year' &&
                        Array.from({ length: 9 }, (_, index) =>
                           addYears(new Date(year - 4, 0, 1), index).getFullYear()
                        ).map((candidate) => (
                           <PeriodButton
                              key={candidate}
                              label={String(candidate)}
                              onClick={() => chooseLabel(String(candidate))}
                           />
                        ))}
                  </div>
               </div>
            )}
            {hasValue && (
               <div className="border-t p-2">
                  <Button
                     type="button"
                     size="xs"
                     variant="ghost"
                     className="w-full justify-start"
                     onClick={() => commit({ label: null, date: null })}
                  >
                     {isStart ? 'Clear start date' : 'Clear target date'}
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
