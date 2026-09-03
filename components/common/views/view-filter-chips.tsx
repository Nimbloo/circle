'use client';

import { ActiveFilters } from '@/components/data-table-filter/components/active-filters';
import { createColumns } from '@/components/data-table-filter/core/filters';
import type { Column, FiltersState } from '@/components/data-table-filter/core/types';
import { useIssueFilterColumns } from '@/components/common/issues/issue-filter-columns';
import { useProjectFilterColumns } from '@/components/common/projects/project-filter-columns';
import { projectViewFilterToFilters, viewFilterToFilters, View } from '@/data/views';
import { useMemo } from 'react';

function ChipsBar<TData>({
   columns,
   filters,
}: {
   columns: Column<TData>[];
   filters: FiltersState;
}) {
   if (filters.length === 0) return null;

   return (
      <div
         role="group"
         aria-label="View filters"
         className="ml-2 mr-2.5 flex h-[46px] w-auto items-center gap-2 rounded-lg border bg-[var(--filter-bar)] p-2.5"
      >
         <ActiveFilters columns={columns} filters={filters} strategy="client" readOnly />
      </div>
   );
}

function IssueViewChips({ view }: { view: View }) {
   const columnsConfig = useIssueFilterColumns();
   const filters = useMemo(() => viewFilterToFilters(view.filter), [view.filter]);
   // Options vêm dos catálogos (estáticas na config), então a lista de dados é irrelevante.
   const columns = useMemo(() => createColumns([], columnsConfig, 'client'), [columnsConfig]);
   return <ChipsBar columns={columns} filters={filters} />;
}

function ProjectViewChips({ view }: { view: View }) {
   const columnsConfig = useProjectFilterColumns();
   const filters = useMemo(() => projectViewFilterToFilters(view.filter), [view.filter]);
   const columns = useMemo(() => createColumns([], columnsConfig, 'client'), [columnsConfig]);
   return <ChipsBar columns={columns} filters={filters} />;
}

/**
 * Barra de filtro SOMENTE LEITURA da página de view salva: os mesmos chips da
 * lista de issues (<IssueFilterBar/>), derivados do `ViewFilter` da view via
 * `viewFilterToFilters` (issue) ou `projectViewFilterToFilters` (project, com as
 * colunas de projeto). Sem editor, sem remover, sem `?filters=` na URL — o filtro
 * de uma view é fixo; edita-se pelo diálogo da view.
 */
export function ViewFilterChips({ view }: { view: View }) {
   return view.type === 'project' ? (
      <ProjectViewChips view={view} />
   ) : (
      <IssueViewChips view={view} />
   );
}
