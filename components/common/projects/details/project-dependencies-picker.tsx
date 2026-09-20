'use client';

import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api, ApiError } from '@/lib/client';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Check, Link2, X } from 'lucide-react';
import { useState } from 'react';
import { useSharedProjectDependencies } from './use-project-detail';
import { PropertyButton } from '../project-property-fields';
import { toast } from 'sonner';

/**
 * Propriedade "Depends on" (#102): escolhe de quais projetos este depende. A guarda
 * de ciclo é do servidor (400) — aqui a mensagem do erro é mostrada como está, em vez
 * de esconder a razão da recusa.
 */
export function ProjectDependenciesPicker({ projectId }: { projectId: string }) {
   const projects = useWorkspaceStore((s) => s.projects);
   // Guardado no provider da rota (pl#6): trocar de aba não refaz o GET, e o evento
   // remoto do projeto recarrega a lista (pl#8).
   const { ids: dependsOn, setIds: setDependsOn } = useSharedProjectDependencies(projectId);
   const [open, setOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   const current = dependsOn ?? [];
   const options = projects.filter((p) => p.id !== projectId);
   const selected = current
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

   const save = async (next: string[]) => {
      const previous = current;
      setDependsOn(next); // otimista
      setBusy(true);
      try {
         setDependsOn(await api.projectDependencies.set(projectId, next));
         toast.success('Dependencies updated');
      } catch (error) {
         setDependsOn(previous); // rollback
         toast.error(
            error instanceof ApiError ? error.message : 'Could not update the dependencies'
         );
      } finally {
         setBusy(false);
      }
   };

   const toggle = (id: string) =>
      void save(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

   return (
      <div className="flex min-w-0 flex-col items-start gap-1 py-0.5">
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <PropertyButton
                  disabled={busy}
                  aria-label="Depends on"
                  className={cn(selected.length === 0 && 'text-muted-foreground')}
               >
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                  {/* Sem resposta ainda, não afirma nada (pl#6). */}
                  {dependsOn === null
                     ? null
                     : selected.length === 0
                       ? 'Add dependency'
                       : `${selected.length} ${selected.length === 1 ? 'project' : 'projects'}`}
               </PropertyButton>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
               <Command>
                  <CommandInput placeholder="Depends on…" />
                  <CommandList>
                     <CommandEmpty>No projects found.</CommandEmpty>
                     <CommandGroup>
                        {options.map((option) => (
                           <CommandItem
                              key={option.id}
                              value={option.name}
                              onSelect={() => toggle(option.id)}
                              className="text-sm"
                           >
                              <span className="flex-1 truncate">{option.name}</span>
                              {current.includes(option.id) && <Check className="size-3.5" />}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>

         {selected.length > 0 && (
            <div className="flex flex-wrap gap-1">
               {selected.map((project) => (
                  <span
                     key={project.id}
                     className="inline-flex max-w-40 items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                  >
                     <span className="truncate">{project.name}</span>
                     <button
                        type="button"
                        onClick={() => toggle(project.id)}
                        aria-label={`Remove dependency ${project.name}`}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                     >
                        <X className="size-3" />
                     </button>
                  </span>
               ))}
            </div>
         )}
      </div>
   );
}
