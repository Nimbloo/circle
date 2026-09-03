'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
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
import { Issue } from '@/data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CheckIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

interface CycleSelectorProps {
   issue: Issue;
   /** Trigger customizado (chip da linha de issue); default: botão com o nome do cycle. */
   children?: ReactNode;
}

/**
 * Selector de ciclo do time da issue (reusa updateIssue({cycleId}) do store). Usado no
 * painel de propriedades e, com trigger próprio, no chip de cycle das linhas.
 */
export function CycleSelector({ issue, children }: CycleSelectorProps) {
   const [open, setOpen] = useState(false);
   // Deriva da fatia assinada: `getCyclesByTeam` devolve array NOVO a cada leitura,
   // entao nao pode ir dentro do seletor (referencia nova = re-render infinito).
   const allCycles = useWorkspaceStore((s) => s.cycles);
   const updateIssue = useIssuesStore((s) => s.updateIssue);

   const teamId = issue.teamId ?? issue.identifier.split('-')[0];
   const cycles = allCycles.filter((c) => c.teamId === teamId);
   const current = issue.cycleId ? allCycles.find((c) => c.id === issue.cycleId) : undefined;

   const select = (cycleId: string) => {
      setOpen(false);
      if (cycleId !== issue.cycleId) updateIssue(issue.id, { cycleId });
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            {children ?? (
               <Button variant="ghost" size="sm" className="h-7 gap-2 px-1.5 -ml-1.5 justify-start">
                  <CyclePlayIcon className="size-4" />
                  <span className="text-sm">{current ? current.name : 'No cycle'}</span>
               </Button>
            )}
         </PopoverTrigger>
         <PopoverContent className="border-input w-64 p-0" align="start">
            <Command>
               <CommandInput placeholder="Set cycle..." />
               <CommandList>
                  <CommandEmpty>No cycles found.</CommandEmpty>
                  <CommandGroup>
                     <CommandItem value="no-cycle" onSelect={() => select('')}>
                        <CyclePlayIcon className="size-4" />
                        <span>No cycle</span>
                        {!issue.cycleId && <CheckIcon size={16} className="ml-auto" />}
                     </CommandItem>
                     {cycles.map((cycle) => (
                        <CommandItem
                           key={cycle.id}
                           value={`${cycle.name} ${cycle.id}`}
                           onSelect={() => select(cycle.id)}
                        >
                           <CyclePlayIcon className="size-4" />
                           <span className="truncate">{cycle.name}</span>
                           {issue.cycleId === cycle.id && (
                              <CheckIcon size={16} className="ml-auto" />
                           )}
                        </CommandItem>
                     ))}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}
