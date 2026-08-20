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

/** Escala de pontos padrão (Fibonacci-ish, estilo Linear). */
export const ESTIMATE_SCALE = [1, 2, 3, 5, 8] as const;

interface EstimateSelectorProps {
   estimate: number | undefined;
   onChange: (estimate: number | undefined) => void;
}

export function EstimateSelector({ estimate, onChange }: EstimateSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState(false);

   const handleChange = (value: number | undefined) => {
      onChange(value);
      setOpen(false);
   };

   const label =
      estimate === undefined ? 'Estimate' : `${estimate} ${estimate === 1 ? 'pt' : 'pts'}`;

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
                        {ESTIMATE_SCALE.map((points) => (
                           <CommandItem
                              key={points}
                              value={String(points)}
                              onSelect={() => handleChange(points)}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <Gauge className="text-muted-foreground size-4" />
                                 {points} {points === 1 ? 'point' : 'points'}
                              </div>
                              {estimate === points && <CheckIcon size={16} className="ml-auto" />}
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
