'use client';

import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { Network, UserRound, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { INITIATIVE_STATUS_META, type Initiative, type InitiativeStatus } from '@/data/initiatives';
import { initiativeWithDescendants } from '@/lib/initiative-tree';
import { cn } from '@/lib/utils';
import { useLabels, usePriorities } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { InitiativeLabelPicker } from './initiative-label-picker';
import { InitiativeStatusIcon } from './initiative-status-icon';
import { InitiativeTargetPicker } from './initiative-target-picker';
import { useInitiativePatch } from './use-initiative-patch';
import { isProjectCompleted } from '@/lib/project-completion';

const formatDay = (iso: string) => format(parseISO(iso), 'MMM d, yyyy');
const STATUS_IDS = Object.keys(INITIATIVE_STATUS_META) as InitiativeStatus[];

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
   return (
      <div className="flex items-center gap-2 text-[13px]">
         <span className="w-24 shrink-0 text-[13px] text-muted-foreground">{label}</span>
         {children}
      </div>
   );
}

/**
 * Botão discreto que abre o popover de edição de uma propriedade. Repassa ref e props:
 * o `PopoverTrigger asChild` injeta `onClick`/`aria-*`/ref no filho — sem isso o
 * popover nunca abria (#5).
 */
export const PropertyButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'>>(
   function PropertyButton({ className, children, ...props }, ref) {
      return (
         <button
            ref={ref}
            type="button"
            {...props}
            className={cn(
               'inline-flex items-center gap-1.5 rounded px-1 -mx-1 py-0.5 hover:bg-accent transition-colors text-left',
               className
            )}
         >
            {children}
         </button>
      );
   }
);

const optionClass = 'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent';

export function InitiativeStatusPicker({ initiative }: { initiative: Initiative }) {
   const patch = useInitiativePatch(initiative.id);
   const [open, setOpen] = useState(false);
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <PropertyButton>
               <InitiativeStatusIcon status={initiative.status} />
               {INITIATIVE_STATUS_META[initiative.status].label}
            </PropertyButton>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-52 p-1">
            {STATUS_IDS.map((s) => (
               <button
                  key={s}
                  type="button"
                  onClick={() => {
                     setOpen(false);
                     if (s === initiative.status) return;
                     void patch(
                        { status: s },
                        { status: s },
                        { success: `Status → ${INITIATIVE_STATUS_META[s].label}` }
                     );
                  }}
                  className={optionClass}
               >
                  <InitiativeStatusIcon status={s} />
                  {INITIATIVE_STATUS_META[s].label}
               </button>
            ))}
         </PopoverContent>
      </Popover>
   );
}

export function InitiativePriorityPicker({ initiative }: { initiative: Initiative }) {
   const patch = useInitiativePatch(initiative.id);
   const priorities = usePriorities();
   const [open, setOpen] = useState(false);
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <PropertyButton>
               <initiative.priority.icon className="size-4 text-muted-foreground" />
               <span className="text-muted-foreground">{initiative.priority.name}</span>
            </PropertyButton>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-52 p-1">
            {priorities.map((p) => (
               <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                     setOpen(false);
                     if (p.id === initiative.priority.id) return;
                     void patch(
                        { priority: p },
                        { priorityId: p.id },
                        { success: `Prioridade → ${p.name}` }
                     );
                  }}
                  className={optionClass}
               >
                  <p.icon className="size-4 text-muted-foreground" />
                  {p.name}
               </button>
            ))}
         </PopoverContent>
      </Popover>
   );
}

export function InitiativeOwnerPicker({ initiative }: { initiative: Initiative }) {
   const patch = useInitiativePatch(initiative.id);
   const users = useWorkspaceStore((s) => s.users);
   const [open, setOpen] = useState(false);
   const choose = (ownerId: string | null) => {
      setOpen(false);
      if (ownerId === (initiative.owner?.id ?? null)) return;
      const owner = ownerId ? users.find((u) => u.id === ownerId) : undefined;
      void patch(
         { owner },
         { ownerId },
         { success: owner ? `Owner → ${owner.name}` : 'Owner removido' }
      );
   };
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <PropertyButton>
               {initiative.owner ? (
                  <>
                     <Avatar className="size-4">
                        <AvatarImage
                           src={initiative.owner.avatarUrl || undefined}
                           alt={initiative.owner.name}
                        />
                        <AvatarFallback className="text-[8px]">
                           {initiative.owner.name[0]}
                        </AvatarFallback>
                     </Avatar>
                     {initiative.owner.name}
                  </>
               ) : (
                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                     <UserRound className="size-4" /> Add owner
                  </span>
               )}
            </PropertyButton>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-60 p-0">
            <Command>
               <CommandInput placeholder="Buscar pessoa…" />
               <CommandList>
                  <CommandEmpty>Ninguém encontrado.</CommandEmpty>
                  <CommandGroup>
                     {initiative.owner && (
                        <CommandItem value="__none__" onSelect={() => choose(null)}>
                           <X className="size-4 text-muted-foreground" />
                           Sem owner
                        </CommandItem>
                     )}
                     {users.map((u) => (
                        <CommandItem key={u.id} value={u.name} onSelect={() => choose(u.id)}>
                           <Avatar className="size-4">
                              <AvatarImage src={u.avatarUrl || undefined} alt={u.name} />
                              <AvatarFallback className="text-[8px]">{u.name[0]}</AvatarFallback>
                           </Avatar>
                           <span className="truncate">{u.name}</span>
                        </CommandItem>
                     ))}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

/**
 * Picker "Parent initiative" (#100). Esconde a própria initiative e sua subárvore —
 * o servidor recusa ciclo com 400, a UI só evita oferecer a opção inválida.
 */
export function ParentInitiativePicker({ initiative }: { initiative: Initiative }) {
   const initiatives = useWorkspaceStore((s) => s.initiatives);
   const patch = useInitiativePatch(initiative.id);
   const [open, setOpen] = useState(false);

   const forbidden = new Set(initiativeWithDescendants(initiatives, initiative.id));
   const options = initiatives.filter((i) => !forbidden.has(i.id));
   const parent = initiative.parentId
      ? initiatives.find((i) => i.id === initiative.parentId)
      : undefined;

   const setParent = (parentId: string | null) => {
      setOpen(false);
      if (parentId === (initiative.parentId ?? null)) return;
      void patch(
         { parentId },
         { parentId },
         {
            success: parentId ? 'Parent initiative definida' : 'Parent initiative removida',
            error: 'Não foi possível atualizar a parent initiative',
         }
      );
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <PropertyButton>
               <Network className="size-3.5 text-muted-foreground" />
               <span className={parent ? undefined : 'text-muted-foreground'}>
                  {parent?.name ?? 'No parent'}
               </span>
            </PropertyButton>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-64 p-0">
            <Command>
               <CommandInput placeholder="Iniciativa pai…" />
               <CommandList>
                  <CommandEmpty>No initiatives.</CommandEmpty>
                  <CommandGroup>
                     <CommandItem value="No parent" onSelect={() => setParent(null)}>
                        No parent
                     </CommandItem>
                     {options.map((candidate) => (
                        <CommandItem
                           key={candidate.id}
                           value={candidate.name}
                           onSelect={() => setParent(candidate.id)}
                        >
                           {candidate.name}
                        </CommandItem>
                     ))}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

/** Painel de propriedades EDITÁVEL da initiative (PATCH otimista e serializado). */
export function InitiativePropertiesPanel({ initiative }: { initiative: Initiative }) {
   const patch = useInitiativePatch(initiative.id);
   const labels = useLabels();
   // Deriva da fatia assinada: assinar `countCompletedProjects` (funcao, referencia
   // estavel) nao acorda o painel quando um projeto e vinculado ou concluido.
   const allProjects = useWorkspaceStore((s) => s.projects);
   const linked = new Set(initiative.projectIds);
   const completed = allProjects.filter((p) => linked.has(p.id) && isProjectCompleted(p)).length;

   return (
      <div className="flex flex-col gap-3">
         <span className="text-[13px] font-medium leading-4">Properties</span>

         <PropertyRow label="Status">
            <InitiativeStatusPicker initiative={initiative} />
         </PropertyRow>

         <PropertyRow label="Priority">
            <InitiativePriorityPicker initiative={initiative} />
         </PropertyRow>

         <PropertyRow label="Owner">
            <InitiativeOwnerPicker initiative={initiative} />
         </PropertyRow>

         <PropertyRow label="Start">
            <InitiativeTargetPicker
               kind="start"
               date={initiative.startDate ?? null}
               onChange={({ date }) =>
                  void patch(
                     { startDate: date ?? undefined },
                     { startDate: date },
                     { success: date ? `Start → ${formatDay(date)}` : 'Start removido' }
                  )
               }
            />
         </PropertyRow>

         <PropertyRow label="Target">
            <InitiativeTargetPicker
               label={initiative.target ?? null}
               date={initiative.targetDate ?? null}
               onChange={({ label, date }) =>
                  void patch(
                     { target: label ?? undefined, targetDate: date ?? undefined },
                     { target: label, targetDate: date },
                     { success: label ? `Target → ${label}` : 'Target removido' }
                  )
               }
            />
         </PropertyRow>

         <PropertyRow label="Labels">
            <InitiativeLabelPicker
               labels={labels}
               value={initiative.labels.map((label) => label.id)}
               onChange={(labelIds) =>
                  void patch(
                     { labels: labels.filter((label) => labelIds.includes(label.id)) },
                     { labelIds },
                     { success: 'Labels atualizadas' }
                  )
               }
            />
         </PropertyRow>

         <PropertyRow label="Parent">
            <ParentInitiativePicker initiative={initiative} />
         </PropertyRow>

         <PropertyRow label="Projects">
            <span className="text-muted-foreground text-xs">
               {completed} / {initiative.projectIds.length} completed
            </span>
         </PropertyRow>

         {initiative.childIds.length > 0 && (
            <PropertyRow label="Rollup">
               <span className="text-muted-foreground text-xs">
                  {initiative.rollupCompletedProjectCount} / {initiative.rollupProjectCount} with
                  sub-initiatives
               </span>
            </PropertyRow>
         )}
      </div>
   );
}
