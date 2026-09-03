'use client';

import { useMemo } from 'react';
import { createColumnConfigHelper } from '@/components/data-table-filter/core/filters';
import type { ColumnOption } from '@/components/data-table-filter/core/types';
import type { LabelInterface } from '@/data/labels';
import type { Priority } from '@/data/priorities';
import type { Project } from '@/data/projects';
import type { Status, StatusCategory } from '@/data/status';
import { useLabels, usePriorities, useProjectStatuses } from '@/store/catalog-store';
import { BarChart3, CircleCheck, CircleDashed, Tag } from 'lucide-react';

/* ------------------------- Options dos catálogos (hidratados) --------------- */

function statusOptionsOf(statuses: Status[]): ColumnOption[] {
   return statuses.map((item) => ({ value: item.id, label: item.name, icon: <item.icon /> }));
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

// Categorias de status de PROJETO (Linear): 'planned' só existe aqui, não em issue.
const STATUS_TYPES: { id: StatusCategory; name: string }[] = [
   { id: 'backlog', name: 'Backlog' },
   { id: 'planned', name: 'Planned' },
   { id: 'started', name: 'In progress' },
   { id: 'completed', name: 'Completed' },
   { id: 'canceled', name: 'Canceled' },
];

const statusTypeOptions: ColumnOption[] = STATUS_TYPES.map((item) => ({
   value: item.id,
   label: item.name,
   icon: <CircleDashed className="size-4 text-muted-foreground" />,
}));

/* ---------------------------- Column definitions --------------------------- */

const dtf = createColumnConfigHelper<Project>();

/**
 * Colunas de filtro de PROJETO — o mínimo que um `ViewFilter` de project view
 * expressa (status, tipo de status, prioridade, labels), no formato do bazza/ui.
 * Só alimenta os chips somente leitura da página da view (`ViewFilterChips`); a
 * filtragem em si continua em `filterProjectsForView`.
 */
function buildProjectFilterColumns(
   statuses: Status[],
   priorities: Priority[],
   labels: LabelInterface[]
) {
   return [
      dtf
         .option()
         .id('status')
         .accessor((p: Project) => p.status.id)
         .displayName('Status')
         .icon(CircleCheck)
         .options(statusOptionsOf(statuses))
         .build(),
      dtf
         .option()
         .id('statusType')
         .accessor((p: Project) => p.status.category)
         .displayName('Status type')
         .icon(CircleDashed)
         .options(statusTypeOptions)
         .build(),
      dtf
         .option()
         .id('priority')
         .accessor((p: Project) => p.priority.id)
         .displayName('Priority')
         .icon(BarChart3)
         .options(priorityOptionsOf(priorities))
         .build(),
      dtf
         .multiOption()
         .id('labels')
         .accessor((p: Project) => p.labels.map((l) => l.id))
         .displayName('Labels')
         .icon(Tag)
         .options(labelOptionsOf(labels))
         .build(),
   ];
}

/** Hook: colunas de projeto com options dos catálogos hidratados. */
export function useProjectFilterColumns() {
   const statuses = useProjectStatuses();
   const priorities = usePriorities();
   const labels = useLabels();
   return useMemo(
      () => buildProjectFilterColumns(statuses, priorities, labels),
      [statuses, priorities, labels]
   );
}
