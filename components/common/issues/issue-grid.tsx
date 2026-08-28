'use client';

import { Issue } from '@/data/issues';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
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
      <div className="w-full p-3 bg-background rounded-md border border-border/50 overflow-hidden">
         <div className="flex items-center justify-between gap-2 mb-2 min-h-5">
            <span className="text-xs text-muted-foreground font-medium">{issue.identifier}</span>
            <AssigneeUser user={issue.assignee} issueId={issue.id} />
         </div>
         <div className="flex items-start gap-1.5 mb-2">
            <span className="mt-px shrink-0">
               <StatusSelector status={issue.status} issueId={issue.id} />
            </span>
            <h3 className="text-sm font-medium leading-snug line-clamp-2">{issue.title}</h3>
         </div>
         <div className="flex items-center flex-wrap gap-1.5 mb-2">
            <PrioritySelector priority={issue.priority} issueId={issue.id} />
            <LabelBadge label={issue.labels} />
            {issue.project && <ProjectBadge project={issue.project} />}
         </div>
         <span className="text-xs text-muted-foreground">
            Created {format(new Date(issue.createdAt), 'MMM d')}
         </span>
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
   const displayProperties = useDisplaySettingsStore((s) => s.displayProperties);
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
               className="w-full p-3 bg-background rounded-md shadow-xs border border-border/50 cursor-default"
               layoutId={layout ? `issue-grid-${issue.identifier}` : undefined}
               style={{
                  opacity: isDragging ? 0.5 : 1,
                  cursor: isDragging ? 'grabbing' : 'default',
               }}
            >
               {/* Row 1: id (esq) + assignee (dir) — padrão Linear */}
               <div className="flex items-center justify-between gap-2 mb-2 min-h-5">
                  {displayProperties.id ? (
                     <span className="text-xs text-muted-foreground font-medium">
                        {issue.identifier}
                     </span>
                  ) : (
                     <span />
                  )}
                  {displayProperties.assignee && (
                     <AssigneeUser user={issue.assignee} issueId={issue.id} />
                  )}
               </div>
               {/* Row 2: status inline com o título */}
               <div className="flex items-start gap-1.5 mb-2">
                  {displayProperties.status && (
                     <span className="mt-px shrink-0">
                        <StatusSelector status={issue.status} issueId={issue.id} />
                     </span>
                  )}
                  <Link
                     href={`/${orgId ?? 'nimbloo'}/issue/${issue.identifier}`}
                     className="min-w-0"
                  >
                     <h3 className="text-sm font-medium leading-snug line-clamp-2">
                        {issue.title}
                     </h3>
                  </Link>
               </div>
               {/* Row 3: prioridade + labels + projeto */}
               <div className="flex items-center flex-wrap gap-1.5 mb-2">
                  {displayProperties.priority && (
                     <PrioritySelector priority={issue.priority} issueId={issue.id} />
                  )}
                  {displayProperties.labels && <LabelBadge label={issue.labels} />}
                  {displayProperties.project && issue.project && (
                     <ProjectBadge project={issue.project} />
                  )}
               </div>
               {/* Row 4: created (esq) + rollup de sub-issues (dir) */}
               <div className="flex items-center justify-between gap-2">
                  {displayProperties.created ? (
                     <span className="text-xs text-muted-foreground">
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
