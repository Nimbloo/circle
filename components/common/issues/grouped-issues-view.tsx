'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Issue, sortIssuesByPriority } from '@/data/issues';
import { Status } from '@/data/status';
import { usePriorities, useLabels } from '@/store/catalog-store';
import { useDisplaySetting } from '@/store/display-settings-store';
import { useFilterStore } from '@/store/filter-store';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { Box, ChevronDown, Tag, User, X } from 'lucide-react';
import { FC, useEffect, useMemo, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { GroupIssues, IssueGroupDescriptor } from './group-issues';
import { VirtualIssueList } from './virtual-issue-list';
import { CustomDragLayer } from './issue-grid';
import { BulkActionsBar } from './bulk-actions-bar';

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
}

/**
 * Estado exibido quando não há nenhum grupo/issue para mostrar. Distingue
 * carregando (hidratando) de falha (com retry) de vazio real.
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
         <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
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
      return <Skeleton className="h-4 w-16" />;
   }
   return <span className="text-sm text-muted-foreground">Nenhuma issue</span>;
}

interface GroupEntry {
   group: IssueGroupDescriptor;
   issues: Issue[];
   /** Count of issues in this group before the filter bar. */
   total: number;
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
               return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
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

const groupByKey = (issues: Issue[], keyOf: (issue: Issue) => string): Map<string, Issue[]> => {
   const map = new Map<string, Issue[]>();
   // Push no array do grupo (O(n)); o spread por issue era O(n²) em listas grandes.
   for (const issue of issues) {
      const key = keyOf(issue);
      const bucket = map.get(key);
      if (bucket) bucket.push(issue);
      else map.set(key, [issue]);
   }
   return map;
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
}) => {
   // Selectors individuais: re-render só quando a chave usada muda (não o store inteiro).
   const grouping = useDisplaySetting('grouping');
   const ordering = useDisplaySetting('ordering');
   const orderCompletedByRecency = useDisplaySetting('orderCompletedByRecency');
   const completedIssues = useDisplaySetting('completedIssues');
   const showEmptyGroups = useDisplaySetting('showEmptyGroups');
   const showSubIssues = useDisplaySetting('showSubIssues');
   const { filters } = useFilterStore();
   const priorities = usePriorities();
   const labels = useLabels();
   const hasActiveFilters = filters.length > 0;

   // Limpa a seleção em lote ao desmontar (troca de view).
   const clearSelection = useBulkSelectionStore((s) => s.clear);
   useEffect(() => () => clearSelection(), [clearSelection]);

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

      const buildGroups = (): { group: IssueGroupDescriptor; issues: Issue[]; total: number }[] => {
         switch (grouping) {
            case 'assignee': {
               const keyOf = (issue: Issue) => issue.assignee?.id ?? 'no-assignee';
               const totals = groupByKey(scopeIssues, keyOf);
               const visible = groupByKey(visibleIssues, keyOf);
               return [...totals.entries()]
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([key, totalGroup]) => {
                     const assignee = totalGroup[0].assignee;
                     return {
                        group: {
                           id: key,
                           name: assignee?.name ?? 'No assignee',
                           icon: assignee ? (
                              <Avatar className="size-4">
                                 <AvatarImage
                                    src={assignee.avatarUrl || undefined}
                                    alt={assignee.name}
                                 />
                                 <AvatarFallback>{assignee.name[0]}</AvatarFallback>
                              </Avatar>
                           ) : (
                              <User className="size-4 text-muted-foreground" />
                           ),
                        },
                        issues: visible.get(key) ?? [],
                        total: totalGroup.length,
                     };
                  });
            }
            case 'priority': {
               return priorities.map((priority) => ({
                  group: {
                     id: priority.id,
                     name: priority.name,
                     icon: <priority.icon className="size-4 text-muted-foreground" />,
                  },
                  issues: visibleIssues.filter((issue) => issue.priority.id === priority.id),
                  total: scopeIssues.filter((issue) => issue.priority.id === priority.id).length,
               }));
            }
            case 'project': {
               const keyOf = (issue: Issue) => issue.project?.id ?? 'no-project';
               const totals = groupByKey(scopeIssues, keyOf);
               const visible = groupByKey(visibleIssues, keyOf);
               return [...totals.entries()]
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([key, totalGroup]) => {
                     const project = totalGroup[0].project;
                     const Icon = project?.icon ?? Box;
                     return {
                        group: {
                           id: key,
                           name: project?.name ?? 'No project',
                           icon: <Icon className="size-4 text-muted-foreground" />,
                        },
                        issues: visible.get(key) ?? [],
                        total: totalGroup.length,
                     };
                  });
            }
            case 'label': {
               // Multi-valorado (padrão Linear): uma issue aparece em cada label que tem.
               const labelGroups = labels.map((label) => ({
                  group: {
                     id: label.id,
                     name: label.name,
                     icon: (
                        <span
                           className="size-2.5 rounded-full"
                           style={{ backgroundColor: label.color }}
                        />
                     ),
                  },
                  issues: visibleIssues.filter((issue) =>
                     issue.labels.some((l) => l.id === label.id)
                  ),
                  total: scopeIssues.filter((issue) => issue.labels.some((l) => l.id === label.id))
                     .length,
               }));
               const noLabel = {
                  group: {
                     id: 'no-label',
                     name: 'No label',
                     icon: <Tag className="size-4 text-muted-foreground" />,
                  },
                  issues: visibleIssues.filter((issue) => issue.labels.length === 0),
                  total: scopeIssues.filter((issue) => issue.labels.length === 0).length,
               };
               return [...labelGroups, noLabel];
            }
            case 'none': {
               return [
                  {
                     group: {
                        id: 'all',
                        name: 'All issues',
                        icon: <Box className="size-4 text-muted-foreground" />,
                     },
                     issues: visibleIssues,
                     total: scopeIssues.length,
                  },
               ];
            }
            case 'status':
            default: {
               return statuses.map((statusItem) => ({
                  group: {
                     id: statusItem.id,
                     name: statusItem.name,
                     icon: <statusItem.icon />,
                     status: statusItem,
                  },
                  issues: visibleIssues.filter((issue) => issue.status.id === statusItem.id),
                  total: scopeIssues.filter((issue) => issue.status.id === statusItem.id).length,
               }));
            }
         }
      };

      return buildGroups().map((entry) => ({
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

   const hiddenCount = Math.max(0, totalIssues.length - issues.length);
   const showFooter = hasActiveFilters && hiddenCount > 0;

   /* ------------------------------- Board ------------------------------- */
   if (isViewTypeGrid) {
      // Padrão Linear: TODA coluna vazia (por filtro OU naturalmente sem issues)
      // colapsa em "Hidden columns" — a menos que "Show empty groups" esteja ligado.
      const boardGroups = groups.filter((entry) => showEmptyGroups || entry.issues.length > 0);
      const hiddenGroups = showEmptyGroups
         ? []
         : groups.filter((entry) => entry.issues.length === 0);

      return (
         <DndProvider backend={HTML5Backend}>
            <CustomDragLayer />
            <BulkActionsBar />
            <div className="h-full flex flex-col">
               <div className="flex-1 min-h-0 overflow-x-auto">
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
                     {boardGroups.length === 0 && hiddenGroups.length === 0 && (
                        <div className="flex items-center justify-center w-full h-40">
                           <IssuesEmptyState loading={loading} error={error} onRetry={onRetry} />
                        </div>
                     )}
                  </div>
               </div>
               {showFooter && (
                  <div className="shrink-0 border-t bg-container">
                     <HiddenByFiltersFooter hiddenCount={hiddenCount} />
                  </div>
               )}
            </div>
         </DndProvider>
      );
   }

   /* -------------------------------- List ------------------------------- */
   const listGroups = groups.filter((entry) => showEmptyGroups || entry.issues.length > 0);

   return (
      <DndProvider backend={HTML5Backend}>
         <CustomDragLayer />
         <BulkActionsBar />
         {listGroups.length === 0 && !showFooter ? (
            <div className="h-full flex items-center justify-center">
               <IssuesEmptyState loading={loading} error={error} onRetry={onRetry} />
            </div>
         ) : (
            <div className="h-full flex flex-col min-h-0">
               {/* Lista VIRTUALIZADA: só as linhas visíveis vão pro DOM (fluido a 1000+). */}
               <div className="flex-1 min-h-0">
                  <VirtualIssueList entries={listGroups} />
               </div>
               {showFooter && (
                  <div className="shrink-0 border-t bg-container">
                     <HiddenByFiltersFooter hiddenCount={hiddenCount} />
                  </div>
               )}
            </div>
         )}
      </DndProvider>
   );
};
