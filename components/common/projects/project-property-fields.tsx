'use client';

import {
   forwardRef,
   useState,
   type ComponentPropsWithoutRef,
   type ComponentType,
   type ReactNode,
} from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar as CalendarIcon, CheckIcon, Compass, Tag, UserPlus, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar } from '@/components/ui/calendar';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { labelColor } from '@/components/common/palette';
import { InitiativeGlyph } from '@/components/common/initiatives/initiative-glyph';
import type { Project } from '@/data/projects';
import type { UpdateProjectInput } from '@/lib/api/projects';
import { activeUsers, type User } from '@/data/users';
import { cn } from '@/lib/utils';
import {
   useDisplayOrderedProjectStatuses,
   useHealthStates,
   useLabels,
   usePriorities,
} from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { formatPlanDay } from './format-day';
import { HealthIcon } from './health-icon';

/* -------------------------------------------------------------------------- */
/*                   Linha de propriedade (padrão do plano S4)                */
/* -------------------------------------------------------------------------- */

/**
 * Linha de propriedade do Linear: 32 px, rótulo de 13 px em muted numa coluna de 96 px
 * e o valor à esquerda. Usada no sidecar do projeto, no peek e no painel da initiative.
 */
export function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
   return (
      <div className="flex min-h-8 items-center gap-2">
         <span className="w-24 shrink-0 truncate text-[13px] text-muted-foreground">{label}</span>
         <div className="flex min-w-0 flex-1 items-center">{children}</div>
      </div>
   );
}

/**
 * Valor editável como botão fantasma (hover `bg-accent`, raio de 6 px). Repassa ref e
 * props: o `PopoverTrigger asChild` injeta `onClick`/`aria-*`/ref no filho.
 */
export const PropertyButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'>>(
   function PropertyButton({ className, children, ...props }, ref) {
      return (
         <button
            ref={ref}
            type="button"
            {...props}
            className={cn(
               '-ml-1.5 inline-flex min-h-7 min-w-0 max-w-full items-center gap-1.5 rounded-[6px] px-1.5 text-left text-[13px] outline-none transition-colors duration-[var(--dur-instant,80ms)] hover:bg-accent focus-visible:bg-accent data-[state=open]:bg-accent',
               className
            )}
         >
            {children}
         </button>
      );
   }
);

/** Valor vazio: "Add X" em muted, com o ícone da propriedade. */
export function EmptyValue({
   icon: Icon,
   children,
}: {
   icon: ComponentType<{ className?: string }>;
   children: ReactNode;
}) {
   return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
         <Icon className="size-3.5 shrink-0" />
         {children}
      </span>
   );
}

/* -------------------------------------------------------------------------- */
/*                               Seletor genérico                             */
/* -------------------------------------------------------------------------- */

interface PickerOption {
   id: string;
   label: string;
   leading?: ReactNode;
}

function PropertyPicker({
   ariaLabel,
   placeholder,
   trigger,
   options,
   selected,
   onSelect,
   multiple = false,
   width = 'w-60',
}: {
   ariaLabel: string;
   placeholder: string;
   trigger: ReactNode;
   options: PickerOption[];
   selected: readonly string[];
   onSelect: (id: string) => void;
   multiple?: boolean;
   width?: string;
}) {
   const [open, setOpen] = useState(false);
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <PropertyButton aria-label={ariaLabel}>{trigger}</PropertyButton>
         </PopoverTrigger>
         <PopoverContent align="start" className={cn(width, 'p-0')}>
            <Command>
               <CommandInput placeholder={placeholder} />
               <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                     {options.map((option) => (
                        <CommandItem
                           key={option.id}
                           value={option.id}
                           keywords={[option.label]}
                           onSelect={() => {
                              if (!multiple) setOpen(false);
                              onSelect(option.id);
                           }}
                           className="text-[13px]"
                        >
                           {option.leading}
                           <span className="truncate">{option.label}</span>
                           {selected.includes(option.id) && (
                              <CheckIcon className="ml-auto size-3.5" />
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

/* -------------------------------------------------------------------------- */
/*                              Campos do projeto                             */
/* -------------------------------------------------------------------------- */

/** PATCH otimista pelo store: lista, board, timeline e peek leem o mesmo projeto. */
function useProjectPatch(projectId: string) {
   const patchProject = useWorkspaceStore((s) => s.patchProject);
   // O store já desfaz o otimista e mostra o erro da API; aqui só se evita a rejeição solta.
   return (local: Partial<Project>, body: UpdateProjectInput) =>
      void patchProject(projectId, local, body).catch(() => undefined);
}

function UserAvatar({ user }: { user: Pick<User, 'name' | 'avatarUrl'> }) {
   return (
      <Avatar className="size-4 shrink-0">
         <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
         <AvatarFallback className="text-[8px]">{user.name[0]}</AvatarFallback>
      </Avatar>
   );
}

const NONE = '__none__';

export function ProjectStatusField({ project }: { project: Project }) {
   const statuses = useDisplayOrderedProjectStatuses();
   const patch = useProjectPatch(project.id);
   return (
      <PropertyPicker
         ariaLabel="Change status"
         placeholder="Change status…"
         selected={[project.status.id]}
         options={statuses.map((s) => ({ id: s.id, label: s.name, leading: <s.icon /> }))}
         onSelect={(id) => {
            const next = statuses.find((s) => s.id === id);
            if (next && id !== project.status.id) patch({ status: next }, { statusId: id });
         }}
         trigger={
            <>
               <project.status.icon />
               <span className="truncate">{project.status.name}</span>
               <span className="text-muted-foreground">{project.percentComplete}%</span>
            </>
         }
      />
   );
}

export function ProjectPriorityField({ project }: { project: Project }) {
   const priorities = usePriorities();
   const patch = useProjectPatch(project.id);
   return (
      <PropertyPicker
         ariaLabel="Change priority"
         placeholder="Change priority…"
         width="w-52"
         selected={[project.priority.id]}
         options={priorities.map((p) => ({
            id: p.id,
            label: p.name,
            leading: <p.icon className="size-3.5 text-muted-foreground" />,
         }))}
         onSelect={(id) => {
            const next = priorities.find((p) => p.id === id);
            if (next && id !== project.priority.id) patch({ priority: next }, { priorityId: id });
         }}
         trigger={
            <>
               <project.priority.icon className="size-3.5 text-muted-foreground" />
               <span className="truncate">{project.priority.name}</span>
            </>
         }
      />
   );
}

export function ProjectLeadField({ project }: { project: Project }) {
   const users = activeUsers(useWorkspaceStore((s) => s.users));
   const patch = useProjectPatch(project.id);
   const options: PickerOption[] = [
      ...(project.lead
         ? [{ id: NONE, label: 'No lead', leading: <UserPlus className="size-3.5" /> }]
         : []),
      ...users.map((u) => ({ id: u.id, label: u.name, leading: <UserAvatar user={u} /> })),
   ];
   return (
      <PropertyPicker
         ariaLabel="Change lead"
         placeholder="Change lead…"
         selected={project.lead ? [project.lead.id] : []}
         options={options}
         onSelect={(id) => {
            const leadId = id === NONE ? null : id;
            if (leadId === (project.lead?.id ?? null)) return;
            const lead = leadId ? (users.find((u) => u.id === leadId) ?? null) : null;
            patch({ lead }, { leadId });
         }}
         trigger={
            project.lead ? (
               <>
                  <UserAvatar user={project.lead} />
                  <span className="truncate">{project.lead.name}</span>
               </>
            ) : (
               <EmptyValue icon={UserPlus}>Add lead</EmptyValue>
            )
         }
      />
   );
}

/**
 * Members do projeto = responsáveis das issues dele. Não há tabela de membros de
 * projeto no schema, então a linha é informativa (não editável).
 */
export function ProjectMembersValue({ members }: { members: User[] }) {
   if (members.length === 0) return <EmptyValue icon={Users}>No members</EmptyValue>;
   return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px]">
         <span className="flex -space-x-1">
            {members.slice(0, 3).map((member) => (
               <UserAvatar key={member.id} user={member} />
            ))}
         </span>
         <span className="truncate">
            {members.length} {members.length === 1 ? 'member' : 'members'}
         </span>
      </span>
   );
}

function DateField({
   ariaLabel,
   emptyLabel,
   value,
   onChange,
}: {
   ariaLabel: string;
   emptyLabel: string;
   value: string | undefined;
   onChange: (next: string | null) => void;
}) {
   const [open, setOpen] = useState(false);
   const selected = value ? parseISO(value) : undefined;
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <PropertyButton aria-label={ariaLabel}>
               {value ? (
                  <>
                     <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
                     <span className="truncate">{formatPlanDay(value)}</span>
                  </>
               ) : (
                  <EmptyValue icon={CalendarIcon}>{emptyLabel}</EmptyValue>
               )}
            </PropertyButton>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-auto p-0">
            <Calendar
               mode="single"
               selected={selected}
               defaultMonth={selected}
               onSelect={(day) => {
                  setOpen(false);
                  const next = day ? format(day, 'yyyy-MM-dd') : null;
                  if (next !== (value ?? null)) onChange(next);
               }}
               initialFocus
            />
            {value && (
               <div className="border-t p-1">
                  <button
                     type="button"
                     onClick={() => {
                        setOpen(false);
                        onChange(null);
                     }}
                     className="flex h-8 w-full items-center rounded-[6px] px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                     Clear date
                  </button>
               </div>
            )}
         </PopoverContent>
      </Popover>
   );
}

export function ProjectStartDateField({ project }: { project: Project }) {
   const patch = useProjectPatch(project.id);
   return (
      <DateField
         ariaLabel="Change start date"
         emptyLabel="Add start date"
         value={project.startDate || undefined}
         onChange={(next) => patch({ startDate: next ?? '' }, { startDate: next })}
      />
   );
}

export function ProjectTargetDateField({ project }: { project: Project }) {
   const patch = useProjectPatch(project.id);
   return (
      <DateField
         ariaLabel="Change target date"
         emptyLabel="Add target date"
         value={project.targetDate}
         onChange={(next) => patch({ targetDate: next ?? undefined }, { targetDate: next })}
      />
   );
}

export function ProjectTeamField({ project }: { project: Project }) {
   const teams = useWorkspaceStore((s) => s.teams);
   const patch = useProjectPatch(project.id);
   const team = teams.find((t) => t.id === project.teamId);
   return (
      <PropertyPicker
         ariaLabel="Change team"
         placeholder="Move to team…"
         selected={[project.teamId]}
         options={teams.map((t) => ({
            id: t.id,
            label: t.name,
            leading: <span className="w-4 shrink-0 text-center text-xs">{t.icon}</span>,
         }))}
         onSelect={(id) => {
            if (id !== project.teamId) patch({ teamId: id }, { teamId: id });
         }}
         trigger={
            <>
               <span className="shrink-0 text-xs">{team?.icon}</span>
               <span className="truncate">{team?.name ?? project.teamId}</span>
            </>
         }
      />
   );
}

export function ProjectInitiativeField({ project }: { project: Project }) {
   const initiatives = useWorkspaceStore((s) => s.initiatives);
   const patch = useProjectPatch(project.id);
   const current = initiatives.find((i) => i.id === project.initiative);
   const options: PickerOption[] = [
      ...(project.initiative
         ? [{ id: NONE, label: 'No initiative', leading: <Compass className="size-3.5" /> }]
         : []),
      ...initiatives.map((i) => ({
         id: i.id,
         label: i.name,
         leading: <InitiativeGlyph icon={i.icon} color={i.iconColor} className="size-3.5" />,
      })),
   ];
   return (
      <PropertyPicker
         ariaLabel="Change initiative"
         placeholder="Add to initiative…"
         selected={project.initiative ? [project.initiative] : []}
         options={options}
         onSelect={(id) => {
            const initiativeId = id === NONE ? null : id;
            if (initiativeId === (project.initiative ?? null)) return;
            patch({ initiative: initiativeId ?? undefined }, { initiativeId });
         }}
         trigger={
            current ? (
               <>
                  <InitiativeGlyph
                     icon={current.icon}
                     color={current.iconColor}
                     className="size-3.5"
                  />
                  <span className="truncate">{current.name}</span>
               </>
            ) : (
               <EmptyValue icon={Compass}>Add initiative</EmptyValue>
            )
         }
      />
   );
}

export function ProjectLabelsField({ project }: { project: Project }) {
   const labels = useLabels();
   const patch = useProjectPatch(project.id);
   const selectedIds = project.labels.map((l) => l.id);
   return (
      <PropertyPicker
         ariaLabel="Change labels"
         placeholder="Add labels…"
         multiple
         selected={selectedIds}
         options={labels.map((l) => ({
            id: l.id,
            label: l.name,
            leading: (
               <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: labelColor(l.color) }}
               />
            ),
         }))}
         onSelect={(id) => {
            // Lê do store: com o popover aberto, cliques seguidos somam sobre o otimista.
            const now = useWorkspaceStore.getState().getProjectById(project.id)?.labels ?? [];
            const next = now.some((l) => l.id === id)
               ? now.filter((l) => l.id !== id)
               : [...now, ...labels.filter((l) => l.id === id)];
            patch({ labels: next }, { labelIds: next.map((l) => l.id) });
         }}
         trigger={
            project.labels.length === 0 ? (
               <EmptyValue icon={Tag}>Add label</EmptyValue>
            ) : (
               <span className="flex min-w-0 flex-wrap items-center gap-1 py-1">
                  {project.labels.map((label) => (
                     <span
                        key={label.id}
                        className="inline-flex max-w-40 items-center gap-1 rounded-full border px-2 py-px text-xs"
                     >
                        <span
                           className="size-2 shrink-0 rounded-full"
                           style={{ backgroundColor: labelColor(label.color) }}
                        />
                        <span className="truncate">{label.name}</span>
                     </span>
                  ))}
               </span>
            )
         }
      />
   );
}

export function ProjectHealthField({ project }: { project: Project }) {
   const healthStates = useHealthStates();
   const patch = useProjectPatch(project.id);
   return (
      <PropertyPicker
         ariaLabel="Change health"
         placeholder="Set health…"
         width="w-52"
         selected={[project.health.id]}
         options={healthStates.map((h) => ({
            id: h.id,
            label: h.name,
            leading: <HealthIcon healthId={h.id} className="size-3.5" />,
         }))}
         onSelect={(id) => {
            const next = healthStates.find((h) => h.id === id);
            if (next && id !== project.health.id) patch({ health: next }, { healthId: id });
         }}
         trigger={
            <>
               <HealthIcon healthId={project.health.id} className="size-3.5" />
               <span className="truncate">{project.health.name}</span>
            </>
         }
      />
   );
}

/**
 * Todas as propriedades editáveis do projeto, na ordem do Linear. `extra` entra depois
 * de Initiatives (ex.: "Depends on", que tem estado próprio).
 */
export function ProjectPropertyRows({
   project,
   members,
   extra,
}: {
   project: Project;
   members: User[];
   extra?: ReactNode;
}) {
   return (
      <div className="flex flex-col">
         <PropertyRow label="Status">
            <ProjectStatusField project={project} />
         </PropertyRow>
         <PropertyRow label="Priority">
            <ProjectPriorityField project={project} />
         </PropertyRow>
         <PropertyRow label="Health">
            <ProjectHealthField project={project} />
         </PropertyRow>
         <PropertyRow label="Lead">
            <ProjectLeadField project={project} />
         </PropertyRow>
         <PropertyRow label="Members">
            <ProjectMembersValue members={members} />
         </PropertyRow>
         <PropertyRow label="Start date">
            <ProjectStartDateField project={project} />
         </PropertyRow>
         <PropertyRow label="Target date">
            <ProjectTargetDateField project={project} />
         </PropertyRow>
         <PropertyRow label="Teams">
            <ProjectTeamField project={project} />
         </PropertyRow>
         <PropertyRow label="Initiatives">
            <ProjectInitiativeField project={project} />
         </PropertyRow>
         {extra}
         <PropertyRow label="Labels">
            <ProjectLabelsField project={project} />
         </PropertyRow>
      </div>
   );
}
