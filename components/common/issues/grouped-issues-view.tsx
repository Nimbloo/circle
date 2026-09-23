'use client';

import { EmptyState } from '@/components/common/empty-state';
import { LoadingArea, useEnterFade } from '@/components/common/loading-area';
import { cn } from '@/lib/utils';
import { Issue, sortIssuesByPriority } from '@/data/issues';
import { Status } from '@/data/status';
import { usePriorities, useLabels } from '@/store/catalog-store';
import { useDisplaySetting } from '@/store/display-settings-store';
import { useFilterStore } from '@/store/filter-store';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { useIssueNavigationStore, type IssueNavItem } from '@/store/issue-navigation-store';
import { ChevronDown, Layers, X } from 'lucide-react';
import { FC, useEffect, useMemo, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { GroupIssues } from './group-issues';
import { buildIssueGroups, subGroupDescriptor, type GroupEntry } from './issue-grouping';
import { BoardSwimlanes, type Swimlane } from './board-swimlanes';
import { VirtualIssueList } from './virtual-issue-list';
import { CustomDragLayer } from './issue-grid';
import { IssueLineDragLayer, IssueLineProjectScopeProvider } from './issue-line';
import { BulkActionsBar } from './bulk-actions-bar';
import { useBulkSelectionKeys } from './use-bulk-selection-keys';
import { useIssueDeleteShortcut } from './use-issue-delete-shortcut';
import { IssueContextMenuHost } from './issue-context-menu-host';

interface GroupedIssuesViewProps {
   /** Issues to display (after the filter bar has been applied). */
   issues: Issue[];
   /** Same scope of issues, before the filter bar — used for "hidden by filters" counts. */
   totalIssues: Issue[];
   /** Statuses to render when grouping by status (empty groups are skipped unless enabled). */
   statuses: Status[];
   isViewTypeGrid: boolean;
   /** Hidratação em andamento — distingue "carregando" de "vazio real". */
   loading?: boolean;
   /** Última hidratação falhou — mostra a falha + botão de retry no lugar do vazio. */
   error?: boolean;
   /** Re-tenta a hidratação (usado pelo estado de falha). */
   onRetry?: () => void;
   /** Aba Issues de um projeto (`/project/:id`): esconde o chip de projeto redundante. */
   currentProjectId?: string;
}

/**
 * Estado exibido quando não há nenhum grupo/issue para mostrar. Distingue
 * carregando (hidratando) de falha (com retry) de vazio real. Ocupa a área toda:
 * o loading fica no topo (onde as linhas vão aparecer), erro e vazio centralizados.
 */
function IssuesEmptyState({
   loading,
   error,
   onRetry,
}: {
   loading?: boolean;
   error?: boolean;
   onRetry?: () => void;
}) {
   if (error) {
      return (
         <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>Não foi possível carregar as issues.</span>
            {onRetry && (
               <button
                  type="button"
                  onClick={onRetry}
                  className="px-2.5 py-1 rounded-md border text-xs font-medium hover:bg-accent/50 transition-colors"
               >
                  Tentar de novo
               </button>
            )}
         </div>
      );
   }
   if (loading) {
      return (
         <div data-testid="issues-loading" className="h-full w-full pt-1">
            <LoadingArea rows={8} />
         </div>
      );
   }
   return (
      <div className="flex h-full items-center justify-center">
         <EmptyState
            icon={Layers}
            title="Nenhuma issue"
            description="Issues criadas aqui aparecem nesta lista."
         />
      </div>
   );
}

const sortIssues = (issues: Issue[], ordering: string, completedByRecency = false): Issue[] => {
   const base = ((): Issue[] => {
      switch (ordering) {
         case 'created':
            return [...issues].sort(
               (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
         case 'title':
            return [...issues].sort((a, b) => a.title.localeCompare(b.title));
         case 'manual':
            // Ordem manual do Linear: pelo `rank` (LexoRank), ascendente.
            return [...issues].sort((a, b) => a.rank.localeCompare(b.rank));
         case 'dueDate':
            // Due date ascendente; issues sem data vão pro fim.
            return [...issues].sort((a, b) => {
               if (!a.dueDate && !b.dueDate) return 0;
               if (!a.dueDate) return 1;
               if (!b.dueDate) return -1;
               return a.dueDate.localeCompare(b.dueDate);
            });
         case 'priority':
         default:
            return sortIssuesByPriority(issues);
      }
   })();
   if (!completedByRecency) return base;
   // Linear "Order completed by recency": completed vão pro fim, por recência
   // (createdAt desc como proxy — o circle não expõe completedAt).
   const active = base.filter((i) => i.status.category !== 'completed');
   const done = base
      .filter((i) => i.status.category === 'completed')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
   return [...active, ...done];
};

/** Footer shown when active filters hide issues — "n issues hidden by filters". */
function HiddenByFiltersFooter({ hiddenCount }: { hiddenCount: number }) {
   const { clearFilters } = useFilterStore();

   return (
      <div className="flex items-center justify-center gap-3 py-4 text-xs text-muted-foreground">
         <span>
            <span className="font-medium text-foreground">
               {hiddenCount} {hiddenCount === 1 ? 'issue' : 'issues'}
            </span>{' '}
            hidden by filters
         </span>
         <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
         >
            Clear filters
            <X className="size-3" />
         </button>
      </div>
   );
}

/** Board-only list of columns fully emptied by the active filters ("0 / n"). */
function HiddenColumns({ entries }: { entries: GroupEntry[] }) {
   const [open, setOpen] = useState(true);

   return (
      <div className="shrink-0 w-[280px] pt-1">
         <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
         >
            <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
            Hidden columns
         </button>
         {open && (
            <div className="flex flex-col gap-1.5 mt-1">
               {entries.map((entry) => (
                  <div
                     key={entry.group.id}
                     className="flex items-center justify-between gap-2 rounded-md border bg-container px-3 h-9"
                  >
                     <div className="flex items-center gap-2 min-w-0">
                        {entry.group.icon}
                        <span className="text-sm truncate">{entry.group.name}</span>
                     </div>
                     <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {entry.total > 0 ? `0 / ${entry.total}` : '0'}
                     </span>
                  </div>
               ))}
            </div>
         )}
      </div>
   );
}

/**
 * Issues grouped according to the Display settings (grouping, ordering,
 * completed visibility, empty groups) — list rows or board columns.
 * Shared by the All/Active/Backlog views and the cycle views.
 *
 * When the filter bar hides issues, a "hidden by filters" footer appears
 * (end of the list / bottom of the board) and, on the board, columns fully
 * emptied by the filters collapse into a "Hidden columns" section.
 */
export const GroupedIssuesView: FC<GroupedIssuesViewProps> = ({
   issues,
   totalIssues,
   statuses,
   isViewTypeGrid,
   loading,
   error,
   onRetry,
   currentProjectId,
}) => {
   // Troca de irmão (aba, item, layout) não pisca: só a primeira chegada de conteúdo.
   const fade = useEnterFade('issues-view');
   // Selectors individuais: re-render só quando a chave usada muda (não o store inteiro).
   const grouping = useDisplaySetting('grouping');
   const subGrouping = useDisplaySetting('subGrouping');
   const ordering = useDisplaySetting('ordering');
   const orderCompletedByRecency = useDisplaySetting('orderCompletedByRecency');
   const completedIssues = useDisplaySetting('completedIssues');
   const showEmptyGroups = useDisplaySetting('showEmptyGroups');
   const showSubIssues = useDisplaySetting('showSubIssues');
   const { filters } = useFilterStore();
   const priorities = usePriorities();
   const labels = useLabels();
   const hasActiveFilters = filters.length > 0;

   // Limpa a seleção em lote ao desmontar (troca de view) e no Esc (is#10).
   const clearSelection = useBulkSelectionStore((s) => s.clear);
   useEffect(() => () => clearSelection(), [clearSelection]);
   useBulkSelectionKeys();
   useIssueDeleteShortcut();

   const groups = useMemo<GroupEntry[]>(() => {
      const hideDone = (list: Issue[]) =>
         completedIssues === 'none'
            ? list.filter(
                 (issue) =>
                    issue.status.category !== 'completed' && issue.status.category !== 'canceled'
              )
            : list;

      // "Show sub-issues" desligado (#95): issues com pai saem da lista/board. Aplica ao
      // escopo também — é opção de display, não filtro (não conta em "hidden by filters").
      const hideSubIssues = (list: Issue[]) =>
         showSubIssues ? list : list.filter((issue) => !issue.parentId);

      const visibleIssues = hideSubIssues(hideDone(issues));
      const scopeIssues = hideSubIssues(hideDone(totalIssues));

      return buildIssueGroups({
         grouping,
         visibleIssues,
         scopeIssues,
         statuses,
         priorities,
         labels,
      }).map((entry) => ({
         ...entry,
         issues: sortIssues(entry.issues, ordering, orderCompletedByRecency),
      }));
   }, [
      issues,
      totalIssues,
      statuses,
      priorities,
      labels,
      grouping,
      ordering,
      orderCompletedByRecency,
      completedIssues,
      showSubIssues,
   ]);

   // Sub-grupos da lista (Display → Sub-grouping): a mesma função de agrupamento, aplicada
   // dentro de cada grupo. A ordem das issues do grupo é preservada; sub-grupo vazio some.
   const subGroupsById = useMemo(() => {
      if (subGrouping === 'none') return null;
      const map = new Map<string, GroupEntry[]>();
      for (const entry of groups) {
         const subs = buildIssueGroups({
            grouping: subGrouping,
            visibleIssues: entry.issues,
            scopeIssues: entry.scope,
            statuses,
            priorities,
            labels,
         })
            .filter((sub) => sub.issues.length > 0)
            .map((sub) => ({ ...sub, group: subGroupDescriptor(entry.group, sub.group) }));
         map.set(entry.group.id, subs);
      }
      return map;
   }, [groups, subGrouping, statuses, priorities, labels]);

   // Swimlanes do board (Display → Rows): uma faixa por valor do sub-grupo, com uma célula
   // por coluna visível. Swimlane sem issue visível some.
   const boardColumns = useMemo(
      () => groups.filter((entry) => showEmptyGroups || entry.issues.length > 0),
      [groups, showEmptyGroups]
   );
   const lanes = useMemo<Swimlane[] | null>(() => {
      if (!isViewTypeGrid || subGrouping === 'none') return null;
      const all = new Map<string, Issue>();
      const scope = new Map<string, Issue>();
      for (const column of boardColumns) {
         for (const issue of column.issues) all.set(issue.id, issue);
         for (const issue of column.scope) scope.set(issue.id, issue);
      }
      return buildIssueGroups({
         grouping: subGrouping,
         visibleIssues: [...all.values()],
         scopeIssues: [...scope.values()],
         statuses,
         priorities,
         labels,
      })
         .filter((lane) => lane.issues.length > 0)
         .map((lane) => {
            const inLane = new Set(lane.issues.map((issue) => issue.id));
            return {
               group: lane.group,
               count: lane.issues.length,
               cells: boardColumns.map((column) => ({
                  group: subGroupDescriptor(column.group, lane.group),
                  issues: column.issues.filter((issue) => inLane.has(issue.id)),
               })),
            };
         });
   }, [isViewTypeGrid, subGrouping, boardColumns, statuses, priorities, labels]);

   // Ordem exibida (grupos → sub-grupos, ou swimlanes → colunas) para seleção e navegação.
   const displayedSections = useMemo<Issue[][]>(() => {
      if (lanes) return lanes.flatMap((lane) => lane.cells.map((cell) => cell.issues));
      if (subGroupsById && !isViewTypeGrid)
         return groups.flatMap((entry) =>
            (subGroupsById.get(entry.group.id) ?? []).map((sub) => sub.issues)
         );
      return groups.map((entry) => entry.issues);
   }, [groups, subGroupsById, lanes, isViewTypeGrid]);

   // Seleção em lote segue o que está na tela (#30): issue apagada, filtrada ou escondida
   // (done/sub-issues) sai da seleção — a barra nunca age sobre o que o usuário não vê.
   const retainSelection = useBulkSelectionStore((s) => s.retain);
   // A mesma ordem visível vira a lista de origem do detalhe (#33: anterior/próxima, J/K).
   const setNavOrder = useIssueNavigationStore((s) => s.setOrder);
   useEffect(() => {
      const visible = new Set<string>();
      const order: IssueNavItem[] = [];
      for (const section of displayedSections)
         for (const issue of section) {
            if (visible.has(issue.id)) continue; // por label, a issue aparece em vários grupos
            visible.add(issue.id);
            order.push({ id: issue.id, identifier: issue.identifier });
         }
      retainSelection(visible);
      setNavOrder(order);
   }, [displayedSections, retainSelection, setNavOrder]);

   // Is#18: só o que o FILTRO escondeu. Done/sub-issues escondidas pelas opções de display
   // saem das duas contagens (antes inflavam o rodapé e o faziam aparecer à toa).
   const hiddenCount = useMemo(() => {
      const inDisplayScope = (issue: Issue) =>
         (completedIssues !== 'none' ||
            (issue.status.category !== 'completed' && issue.status.category !== 'canceled')) &&
         (showSubIssues || !issue.parentId);
      return Math.max(
         0,
         totalIssues.filter(inDisplayScope).length - issues.filter(inDisplayScope).length
      );
   }, [issues, totalIssues, completedIssues, showSubIssues]);
   const showFooter = hasActiveFilters && hiddenCount > 0;

   // Nenhuma issue em grupo algum (e não é filtro que escondeu tudo): carregando, falha
   // ou vazio real. No board, sem esta guarda, todas as colunas iam para "Hidden columns".
   const nothingToShow = groups.every((entry) => entry.issues.length === 0) && !showFooter;

   /* ------------------------------- Board ------------------------------- */
   if (isViewTypeGrid) {
      if (nothingToShow && (loading || error || !showEmptyGroups)) {
         return <IssuesEmptyState loading={loading} error={error} onRetry={onRetry} />;
      }

      // Padrão Linear: TODA coluna vazia (por filtro OU naturalmente sem issues)
      // colapsa em "Hidden columns" — a menos que "Show empty groups" esteja ligado.
      const boardGroups = boardColumns;
      const hiddenGroups = showEmptyGroups
         ? []
         : groups.filter((entry) => entry.issues.length === 0);

      return (
         <IssueLineProjectScopeProvider projectId={currentProjectId}>
            <DndProvider backend={HTML5Backend}>
               <CustomDragLayer />
               <BulkActionsBar />
               <div className={cn(fade && 'content-enter', 'h-full flex flex-col')}>
                  <div className="flex-1 min-h-0 overflow-x-auto">
                     <IssueContextMenuHost>
                        {lanes ? (
                           <div className="h-full overflow-y-auto">
                              <BoardSwimlanes
                                 columns={boardGroups.map((entry) => ({
                                    group: entry.group,
                                    count: entry.issues.length,
                                 }))}
                                 lanes={lanes}
                              />
                              {hiddenGroups.length > 0 && (
                                 <div className="px-1">
                                    <HiddenColumns entries={hiddenGroups} />
                                 </div>
                              )}
                           </div>
                        ) : (
                           <div className="flex h-full min-w-max gap-0 px-1">
                              {boardGroups.map((entry) => (
                                 <GroupIssues
                                    key={entry.group.id}
                                    group={entry.group}
                                    issues={entry.issues}
                                    count={entry.issues.length}
                                 />
                              ))}
                              {hiddenGroups.length > 0 && <HiddenColumns entries={hiddenGroups} />}
                           </div>
                        )}
                     </IssueContextMenuHost>
                  </div>
                  {showFooter && (
                     <div className="shrink-0 border-t bg-container">
                        <HiddenByFiltersFooter hiddenCount={hiddenCount} />
                     </div>
                  )}
               </div>
            </DndProvider>
         </IssueLineProjectScopeProvider>
      );
   }

   /* -------------------------------- List ------------------------------- */
   const listGroups = groups
      .filter((entry) => showEmptyGroups || entry.issues.length > 0)
      .map((entry) =>
         subGroupsById ? { ...entry, subgroups: subGroupsById.get(entry.group.id) } : entry
      );

   return (
      <IssueLineProjectScopeProvider projectId={currentProjectId}>
         <DndProvider backend={HTML5Backend}>
            <IssueLineDragLayer />
            <BulkActionsBar />
            {listGroups.length === 0 && !showFooter ? (
               <IssuesEmptyState loading={loading} error={error} onRetry={onRetry} />
            ) : (
               <div className={cn(fade && 'content-enter', 'h-full flex flex-col min-h-0')}>
                  {/* Lista VIRTUALIZADA: só as linhas visíveis vão pro DOM (fluido a 1000+). */}
                  <div className="flex-1 min-h-0">
                     <IssueContextMenuHost>
                        <VirtualIssueList entries={listGroups} />
                     </IssueContextMenuHost>
                  </div>
                  {showFooter && (
                     <div className="shrink-0 border-t bg-container">
                        <HiddenByFiltersFooter hiddenCount={hiddenCount} />
                     </div>
                  )}
               </div>
            )}
         </DndProvider>
      </IssueLineProjectScopeProvider>
   );
};
