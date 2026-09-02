'use client';

import { useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createColumnConfigHelper } from '@/components/data-table-filter/core/filters';
import type { ColumnOption, FiltersState } from '@/components/data-table-filter/core/types';
import {
   dateFilterFn,
   multiOptionFilterFn,
   optionFilterFn,
} from '@/components/data-table-filter/lib/filter-fns';
import { cycleStatusLabel } from '@/data/cycles';
import type { Cycle } from '@/data/cycles';
import { Issue } from '@/data/issues';
import type { Status, StatusCategory } from '@/data/status';
import type { Priority } from '@/data/priorities';
import type { LabelInterface } from '@/data/labels';
import type { Project } from '@/data/projects';
import type { User } from '@/data/users';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useCatalogStore } from '@/store/catalog-store';
import {
   BarChart3,
   CalendarClock,
   CalendarPlus,
   CircleCheck,
   CircleDashed,
   CircleUserRound,
   Folder,
   RefreshCcw,
   Tag,
   UserPen,
} from 'lucide-react';

/* ------------------------- Options dos catálogos (hidratados) --------------- */

function statusOptionsOf(statuses: Status[]): ColumnOption[] {
   return statuses.map((item) => ({
      value: item.id,
      label: item.name,
      icon: <item.icon />,
   }));
}

function priorityOptionsOf(priorities: Priority[]): ColumnOption[] {
   return priorities.map((priority) => ({
      value: priority.id,
      label: priority.name,
      icon: <priority.icon className="size-4 text-muted-foreground" />,
   }));
}

function labelOptionsOf(labels: LabelInterface[]): ColumnOption[] {
   return labels.map((label) => ({
      value: label.id,
      label: label.name,
      icon: <span className="size-2.5 rounded-full" style={{ backgroundColor: label.color }} />,
   }));
}

const STATUS_TYPES: { id: StatusCategory; name: string }[] = [
   { id: 'triage', name: 'Triage' },
   { id: 'backlog', name: 'Backlog' },
   { id: 'unstarted', name: 'Unstarted' },
   { id: 'started', name: 'Started' },
   { id: 'completed', name: 'Completed' },
   { id: 'canceled', name: 'Canceled' },
];

const statusTypeOptions: ColumnOption[] = STATUS_TYPES.map((item) => ({
   value: item.id,
   label: item.name,
   icon: <CircleDashed className="size-4 text-muted-foreground" />,
}));

/* ---------------------- Options dinâmicas (do workspace) -------------------- */

function assigneeOptions(users: User[]): ColumnOption[] {
   return [
      {
         value: 'unassigned',
         label: 'Unassigned',
         icon: <CircleUserRound className="size-4 text-muted-foreground" />,
      },
      ...users.map((user) => ({
         value: user.id,
         label: user.name,
         icon: (
            <Avatar className="size-4">
               <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
               <AvatarFallback>{user.name[0]}</AvatarFallback>
            </Avatar>
         ),
      })),
   ];
}

// Valor ausente vira opção explícita (padrão Linear: "No project"), como `unassigned`
// e `no-cycle` — assim "Project is No project" e "is not X" funcionam sem caso especial.
export const NO_PROJECT = 'no-project';
export const NO_CREATOR = 'no-creator';

function creatorOptions(users: User[]): ColumnOption[] {
   return [
      {
         value: NO_CREATOR,
         label: 'No creator',
         icon: <UserPen className="size-4 text-muted-foreground" />,
      },
      ...users.map((user) => ({
         value: user.id,
         label: user.name,
         icon: (
            <Avatar className="size-4">
               <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
               <AvatarFallback>{user.name[0]}</AvatarFallback>
            </Avatar>
         ),
      })),
   ];
}

function projectOptions(projects: Project[]): ColumnOption[] {
   return [
      {
         value: NO_PROJECT,
         label: 'No project',
         icon: <Folder className="size-4 text-muted-foreground" />,
      },
      ...projects.map((project) => ({
         value: project.id,
         label: project.name,
         icon: <project.icon className="size-4 text-muted-foreground" />,
      })),
   ];
}

function cycleOptions(cycles: Cycle[]): ColumnOption[] {
   return [
      {
         value: 'no-cycle',
         label: 'No cycle',
         icon: <RefreshCcw className="size-4 text-muted-foreground" />,
      },
      ...cycles.map((cycle) => ({
         value: cycle.id,
         label: `${cycle.name} (${cycleStatusLabel[cycle.status]})`,
         icon: <RefreshCcw className="size-4 text-muted-foreground" />,
      })),
   ];
}

/* ---------------------------- Column definitions --------------------------- */

const dtf = createColumnConfigHelper<Issue>();

/** Constrói as colunas de filtro; options (catálogos + workspace) vazias no build p/ applyIssueFilters. */
function buildIssueFilterColumns(
   users: User[],
   projects: Project[],
   cycles: Cycle[],
   statuses: Status[],
   priorities: Priority[],
   labels: LabelInterface[]
) {
   return [
      dtf
         .option()
         .id('status')
         .accessor((i: Issue) => i.status.id)
         .displayName('Status')
         .icon(CircleCheck)
         .options(statusOptionsOf(statuses))
         .build(),
      dtf
         .option()
         .id('statusType')
         .accessor((i: Issue) => i.status.category)
         .displayName('Status type')
         .icon(CircleDashed)
         .options(statusTypeOptions)
         .build(),
      dtf
         .option()
         .id('assignee')
         .accessor((i: Issue) => i.assignee?.id ?? 'unassigned')
         .displayName('Assignee')
         .icon(CircleUserRound)
         .options(assigneeOptions(users))
         .build(),
      dtf
         .option()
         .id('priority')
         .accessor((i: Issue) => i.priority.id)
         .displayName('Priority')
         .icon(BarChart3)
         .options(priorityOptionsOf(priorities))
         .build(),
      dtf
         .multiOption()
         .id('labels')
         .accessor((i: Issue) => i.labels.map((l) => l.id))
         .displayName('Labels')
         .icon(Tag)
         .options(labelOptionsOf(labels))
         .build(),
      dtf
         .option()
         .id('project')
         .accessor((i: Issue) => i.project?.id ?? NO_PROJECT)
         .displayName('Project')
         .icon(Folder)
         .options(projectOptions(projects))
         .build(),
      dtf
         .option()
         .id('cycle')
         .accessor((i: Issue) => (i.cycleId === '' ? 'no-cycle' : i.cycleId))
         .displayName('Cycle')
         .icon(RefreshCcw)
         .options(cycleOptions(cycles))
         .build(),
      dtf
         .option()
         .id('creator')
         .accessor((i: Issue) => i.createdById ?? NO_CREATOR)
         .displayName('Created by')
         .icon(UserPen)
         .options(creatorOptions(users))
         .build(),
      dtf
         .date()
         .id('dueDate')
         .accessor((i: Issue) => (i.dueDate ? new Date(i.dueDate) : (undefined as unknown as Date)))
         .displayName('Due date')
         .icon(CalendarClock)
         .build(),
      dtf
         .date()
         .id('createdAt')
         .accessor((i: Issue) => new Date(i.createdAt))
         .displayName('Created')
         .icon(CalendarPlus)
         .build(),
   ];
}

/** Colunas com os accessors (options vazias) — usado por applyIssueFilters (data-independente). */
const accessorColumns = buildIssueFilterColumns([], [], [], [], [], []);
const columnById = new Map<string, (typeof accessorColumns)[number]>(
   accessorColumns.map((column) => [column.id, column])
);

/** Hook: colunas com options completas (catálogos hidratados + workspace) para a UI de filtro. */
export function useIssueFilterColumns() {
   const users = useWorkspaceStore((s) => s.users);
   const projects = useWorkspaceStore((s) => s.projects);
   const cycles = useWorkspaceStore((s) => s.cycles);
   const statuses = useCatalogStore((s) => s.statuses);
   const priorities = useCatalogStore((s) => s.priorities);
   const labels = useCatalogStore((s) => s.labels);
   return useMemo(
      () => buildIssueFilterColumns(users, projects, cycles, statuses, priorities, labels),
      [users, projects, cycles, statuses, priorities, labels]
   );
}

const NEGATIVE_DATE_OPERATORS = new Set(['is not', 'is not between']);

/**
 * Aplica um FiltersState (bazza/ui) a uma lista de issues, honrando o operador
 * de cada filtro. Data-independente (usa só os accessors).
 */
export function applyIssueFilters(issues: Issue[], filters: FiltersState): Issue[] {
   if (filters.length === 0) return issues;
   return issues.filter((issue) =>
      filters.every((filter) => {
         const column = columnById.get(filter.columnId);
         if (!column) return true;
         const value = column.accessor(issue);
         switch (filter.type) {
            case 'option':
               return optionFilterFn(String(value ?? ''), filter) ?? true;
            case 'multiOption':
               return multiOptionFilterFn((value as string[]) ?? [], filter) ?? true;
            case 'date':
               // Sem a data (ex.: sem due date): passa só nos operadores negativos — a issue
               // "não é" / "não está entre" aquela data. Nos demais fica de fora.
               if (!(value instanceof Date)) return NEGATIVE_DATE_OPERATORS.has(filter.operator);
               return dateFilterFn(value, filter);
            default:
               return true;
         }
      })
   );
}
