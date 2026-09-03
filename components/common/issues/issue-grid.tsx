'use client';

import { Issue } from '@/data/issues';
import { useDisplaySetting } from '@/store/display-settings-store';
import { useIssuesStore } from '@/store/issues-store';
import { format } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { DragSourceMonitor, useDrag, useDragLayer, useDrop } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { AssigneeUser } from './assignee-user';
import { LabelBadge } from './label-badge';
import { PrioritySelector } from './priority-selector';
import { ProjectBadge } from './project-badge';
import { StatusSelector } from './status-selector';
import { SubIssueProgress } from './sub-issue-progress';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IssueContextMenu } from './issue-context-menu';

export const IssueDragType = 'ISSUE';
/** Resultado retornado pelo drop do card → o container (GroupIssues) lê `didDrop()`. */
type IssueDropResult = { handled: true };
type IssueGridProps = {
   issue: Issue;
   /** Issues do grupo na ordem de exibição (asc rank) — usado p/ calcular os vizinhos no reorder. */
   orderedIssues: Issue[];
   /** Animação de layout do motion (layoutId). Desligada na coluna virtualizada
    *  (o mount/unmount da virtualização brigaria com a animação de layout). */
   layout?: boolean;
};

// Custom DragLayer component to render the drag preview
function IssueDragPreview({ issue }: { issue: Issue }) {
   return (
      <div className="w-full overflow-hidden rounded-lg bg-card p-2 shadow-[var(--card-shadow)]">
         <div className="relative mb-2.5 h-[37px]">
            <div className="flex h-[37px] flex-col pl-1 pr-[34px]">
               <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {issue.identifier}
               </span>
               <div className="mt-1.5 flex h-4 items-center gap-1.5">
                  <StatusSelector compact status={issue.status} issueId={issue.id} />
                  <h3 className="line-clamp-2 text-[13px] font-medium leading-4">{issue.title}</h3>
               </div>
            </div>
            <div className="absolute right-0 top-0">
               <AssigneeUser compact user={issue.assignee} issueId={issue.id} />
            </div>
         </div>
         <div className="flex min-h-6 flex-wrap items-center gap-1">
            <PrioritySelector compact priority={issue.priority} issueId={issue.id} />
            <LabelBadge label={issue.labels} />
            {issue.project && <ProjectBadge project={issue.project} />}
         </div>
         <div className="mt-1.5 flex min-h-6 items-center">
            <span className="text-xs tabular-nums text-muted-foreground">
               Created {format(new Date(issue.createdAt), 'MMM d')}
            </span>
         </div>
      </div>
   );
}

// Custom DragLayer to show custom preview during drag
export function CustomDragLayer() {
   const { itemType, isDragging, item, currentOffset } = useDragLayer((monitor) => ({
      item: monitor.getItem() as Issue,
      itemType: monitor.getItemType(),
      currentOffset: monitor.getSourceClientOffset(),
      isDragging: monitor.isDragging(),
   }));

   if (!isDragging || itemType !== IssueDragType || !currentOffset) {
      return null;
   }

   return (
      <div
         className="fixed pointer-events-none z-50 left-0 top-0"
         style={{
            transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
            width: '348px', // Match the width of your cards
         }}
      >
         <IssueDragPreview issue={item} />
      </div>
   );
}

export function IssueGrid({ issue, orderedIssues, layout = true }: IssueGridProps) {
   const ref = useRef<HTMLDivElement>(null);
   const { orgId } = useParams<{ orgId: string }>();
   const displayProperties = useDisplaySetting('displayProperties');
   const reorderIssue = useIssuesStore((s) => s.reorderIssue);
   const updateIssueStatus = useIssuesStore((s) => s.updateIssueStatus);

   // Set up drag functionality.
   const [{ isDragging }, drag, preview] = useDrag(() => ({
      type: IssueDragType,
      item: issue,
      collect: (monitor: DragSourceMonitor) => ({
         isDragging: monitor.isDragging(),
      }),
   }));

   // Use empty image as drag preview (we'll create a custom one with DragLayer)
   useEffect(() => {
      preview(getEmptyImage(), { captureDraggingState: true });
   }, [preview]);

   // Drop sobre um card: reordena (mesmo grupo) ou muda status (grupo diferente).
   // Retornar um resultado sinaliza `monitor.didDrop()` ao container, que só aplica
   // status quando o drop caiu na área vazia do grupo (nenhum card tratou).
   const [, drop] = useDrop<Issue, IssueDropResult, unknown>(
      () => ({
         accept: IssueDragType,
         drop(item, monitor): IssueDropResult | undefined {
            if (item.id === issue.id) return { handled: true };

            // Grupo diferente: adota o status do card-alvo (equivale ao drop no grupo).
            if (item.status.id !== issue.status.id) {
               updateIssueStatus(item.id, issue.status);
               return { handled: true };
            }

            // Mesmo grupo: reordena por rank entre os vizinhos do alvo (exclui o arrastado).
            const list = orderedIssues.filter((i) => i.id !== item.id);
            const targetIdx = list.findIndex((i) => i.id === issue.id);
            if (targetIdx === -1) return { handled: true };

            const rect = ref.current?.getBoundingClientRect();
            const pointerY = monitor.getClientOffset()?.y ?? 0;
            const dropAbove = rect ? pointerY < rect.top + rect.height / 2 : false;

            // asc(rank): index menor = rank menor = acima. beforeId = vizinho de rank menor,
            // afterId = vizinho de rank maior (rankBetween grava um rank entre os dois).
            const beforeId = dropAbove ? (list[targetIdx - 1]?.id ?? null) : issue.id;
            const afterId = dropAbove ? issue.id : (list[targetIdx + 1]?.id ?? null);
            reorderIssue(item.id, beforeId, afterId);
            return { handled: true };
         },
      }),
      [issue, orderedIssues, reorderIssue, updateIssueStatus]
   );

   // Connect drag and drop to the element.
   drag(drop(ref));

   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>
            <motion.div
               ref={ref}
               className="w-full cursor-default rounded-lg bg-card p-2 shadow-[var(--card-shadow)]"
               layoutId={layout ? `issue-grid-${issue.identifier}` : undefined}
               style={{
                  opacity: isDragging ? 0.5 : 1,
                  cursor: isDragging ? 'grabbing' : 'default',
               }}
            >
               {/* Bloco superior: conteúdo à esquerda e assignee fixo no canto. */}
               <div className="relative mb-2.5 h-[37px]">
                  <div className="flex h-[37px] flex-col pl-1 pr-[34px]">
                     {displayProperties.id ? (
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                           {issue.identifier}
                        </span>
                     ) : (
                        <span />
                     )}
                     <div className="mt-1.5 flex h-4 items-center gap-1.5">
                        {displayProperties.status && (
                           <StatusSelector compact status={issue.status} issueId={issue.id} />
                        )}
                        <Link
                           href={`/${orgId ?? 'nimbloo'}/issue/${issue.identifier}`}
                           className="min-w-0"
                        >
                           <h3 className="line-clamp-2 text-[13px] font-medium leading-4">
                              {issue.title}
                           </h3>
                        </Link>
                     </div>
                  </div>
                  {displayProperties.assignee && (
                     <div className="absolute right-0 top-0">
                        <AssigneeUser compact user={issue.assignee} issueId={issue.id} />
                     </div>
                  )}
               </div>
               {/* Propriedades */}
               <div className="flex min-h-6 flex-wrap items-center gap-1">
                  {displayProperties.priority && (
                     <PrioritySelector compact priority={issue.priority} issueId={issue.id} />
                  )}
                  {displayProperties.labels && <LabelBadge label={issue.labels} />}
                  {displayProperties.project && issue.project && (
                     <ProjectBadge project={issue.project} />
                  )}
               </div>
               {/* Rodapé */}
               <div className="mt-1.5 flex min-h-6 items-center justify-between gap-2">
                  {displayProperties.created ? (
                     <span className="text-xs tabular-nums text-muted-foreground">
                        Created {format(new Date(issue.createdAt), 'MMM d')}
                     </span>
                  ) : (
                     <span />
                  )}
                  <SubIssueProgress count={issue.subIssueCount} done={issue.subIssueDoneCount} />
               </div>
            </motion.div>
         </ContextMenuTrigger>
         <IssueContextMenu issueId={issue.id} />
      </ContextMenu>
   );
}
