'use client';

import type { Issue } from '@/data/issues';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { GroupHeaderBar, useGroupGetter, type IssueGroupDescriptor } from './group-issues';
import { IssueGrid } from './issue-grid';
import { useGroupDropTarget } from './use-issue-drop-target';

export interface SwimlaneCell {
   /** Descritor combinado coluna × swimlane (`drop` da coluna + `subDrop` da swimlane). */
   group: IssueGroupDescriptor;
   issues: Issue[];
}

export interface Swimlane {
   group: IssueGroupDescriptor;
   count: number;
   /** Uma célula por coluna, na mesma ordem de `columns`. */
   cells: SwimlaneCell[];
}

interface BoardSwimlanesProps {
   columns: { group: IssueGroupDescriptor; count: number }[];
   lanes: Swimlane[];
}

/**
 * Célula coluna × swimlane: alvo de drop (muda coluna e swimlane) com os cards. Sem
 * virtualização (2D, com a rolagem do board inteiro, não compensa): cada card usa
 * `content-visibility: auto`, então o navegador pula layout e pintura dos que estão fora
 * da tela — com Rows ligado e muitas issues o custo fica no DOM, não no render.
 */
function Cell({ group, issues }: SwimlaneCell) {
   const ref = useRef<HTMLDivElement>(null);
   const getGroup = useGroupGetter(group, issues);
   const [{ isOver }, drop] = useGroupDropTarget(getGroup);
   drop(ref);
   return (
      <div
         ref={ref}
         className={cn(
            'flex min-h-16 w-[348px] shrink-0 flex-col gap-2 rounded-md pb-3 pl-[13px] pr-4 pt-1 transition-colors',
            isOver && 'bg-accent/40'
         )}
      >
         {issues.map((issue) => (
            <div
               key={issue.id}
               data-slot="swimlane-card"
               // 132px = altura típica do card (mesma estimativa da coluna virtualizada).
               className="[content-visibility:auto] [contain-intrinsic-size:auto_132px]"
            >
               <IssueGrid issue={issue} getGroup={getGroup} />
            </div>
         ))}
      </div>
   );
}

/**
 * Board com "Rows" (swimlanes, padrão Linear): colunas pelo grupo principal, uma faixa
 * horizontal por valor do sub-grupo. Cabeçalhos das colunas fixos no topo; cabeçalho de
 * swimlane colapsável, com contagem.
 */
export function BoardSwimlanes({ columns, lanes }: BoardSwimlanesProps) {
   const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
   const toggle = (id: string) =>
      setCollapsed((prev) => {
         const next = new Set(prev);
         if (next.has(id)) next.delete(id);
         else next.add(id);
         return next;
      });

   return (
      <div className="min-w-max pb-3">
         <div className="sticky top-0 z-20 flex bg-background px-1">
            {columns.map((column) => (
               <div key={column.group.id} className="w-[348px] shrink-0">
                  <GroupHeaderBar group={column.group} count={column.count} isViewTypeGrid />
               </div>
            ))}
         </div>
         {lanes.map((lane) => {
            const open = !collapsed.has(lane.group.id);
            return (
               <div key={lane.group.id} data-testid="board-swimlane" className="px-1">
                  <button
                     type="button"
                     aria-expanded={open}
                     onClick={() => toggle(lane.group.id)}
                     className="sticky left-0 flex h-9 items-center gap-2 rounded-md px-3.5 text-left transition-colors hover:bg-accent/40"
                  >
                     <ChevronRight
                        className={cn(
                           'size-3.5 text-muted-foreground transition-transform',
                           open && 'rotate-90'
                        )}
                        aria-hidden
                     />
                     {lane.group.icon}
                     <span className="text-[13px] font-medium">{lane.group.name}</span>
                     <span className="text-xs tabular-nums text-muted-foreground">
                        {lane.count}
                     </span>
                  </button>
                  {open && (
                     <div className="flex border-b border-border/60">
                        {lane.cells.map((cell) => (
                           <Cell key={cell.group.id} group={cell.group} issues={cell.issues} />
                        ))}
                     </div>
                  )}
               </div>
            );
         })}
      </div>
   );
}
