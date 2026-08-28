'use client';

import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CheckIcon, Gauge } from 'lucide-react';
import { useId, useState } from 'react';
import { useWorkspaceStore } from '@/store/workspace-store';
import { ESTIMATE_SCALES, estimateLabel, normalizeScale } from '@/data/estimate-scales';

/** Escala de pontos padrão (Fibonacci) — fallback quando não há time. */
export const ESTIMATE_SCALE = [1, 2, 3, 5, 8] as const;

interface EstimateSelectorProps {
   estimate: number | undefined;
   onChange: (estimate: number | undefined) => void;
   /** Time da issue — determina a escala de estimate (paridade Linear). */
   teamId?: string;
}

export function EstimateSelector({ estimate, onChange, teamId }: EstimateSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState(false);
   // Escala do time (Fibonacci/Exponential/Linear/T-shirt); default Fibonacci.
   const team = useWorkspaceStore((s) => (teamId ? s.getTeamById(teamId) : undefined));
   const scale = normalizeScale(team?.estimateScale);
   const options = ESTIMATE_SCALES[scale];

   const handleChange = (value: number | undefined) => {
      onChange(value);
      setOpen(false);
   };

   const label = estimate === undefined ? 'Estimate' : estimateLabel(estimate, scale);

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
                  <Gauge className="text-muted-foreground size-4" />
                  <span>{label}</span>
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <Command>
                  <CommandList>
                     <CommandEmpty>No estimate found.</CommandEmpty>
                     <CommandGroup>
                        <CommandItem
                           value="none"
                           onSelect={() => handleChange(undefined)}
                           className="flex items-center justify-between"
                        >
                           <div className="flex items-center gap-2">
                              <Gauge className="text-muted-foreground size-4" />
                              No estimate
                           </div>
                           {estimate === undefined && <CheckIcon size={16} className="ml-auto" />}
                        </CommandItem>
                        {options.map((opt) => (
                           <CommandItem
                              key={opt.value}
                              value={String(opt.value)}
                              onSelect={() => handleChange(opt.value)}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <Gauge className="text-muted-foreground size-4" />
                                 {opt.label}
                                 {opt.label !== String(opt.value) && (
                                    <span className="text-xs text-muted-foreground">
                                       ({opt.value} pts)
                                    </span>
                                 )}
                              </div>
                              {estimate === opt.value && (
                                 <CheckIcon size={16} className="ml-auto" />
                              )}
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
