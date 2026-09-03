'use client';

import { ActiveFilters } from '@/components/data-table-filter/components/active-filters';
import { createColumns } from '@/components/data-table-filter/core/filters';
import { useIssueFilterColumns } from '@/components/common/issues/issue-filter-columns';
import { viewFilterToFilters, View } from '@/data/views';
import { useMemo } from 'react';

/**
 * Barra de filtro SOMENTE LEITURA da página de view salva: os mesmos chips da
 * lista de issues (<IssueFilterBar/>), derivados do `ViewFilter` da view via
 * `viewFilterToFilters`. Sem editor, sem remover, sem `?filters=` na URL — o filtro
 * de uma view é fixo; edita-se pelo diálogo da view.
 */
export function ViewFilterChips({ view }: { view: View }) {
   const columnsConfig = useIssueFilterColumns();
   const filters = useMemo(() => viewFilterToFilters(view.filter), [view.filter]);
   // Options vêm dos catálogos (estáticas na config), então a lista de dados é irrelevante.
   const columns = useMemo(() => createColumns([], columnsConfig, 'client'), [columnsConfig]);

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
