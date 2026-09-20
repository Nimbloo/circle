'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { Issue } from '@/data/issues';
import { useDisplaySetting } from '@/store/display-settings-store';
import { format } from 'date-fns';
import { MaybeLink } from './maybe-link';
import { useParams } from 'next/navigation';
import { motion } from 'motion/react';
import { memo, useEffect, useRef } from 'react';
import { DragSourceMonitor, useDrag, useDragLayer } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { AssigneeUser } from './assignee-user';
import { LabelBadge } from './label-badge';
import { PrioritySelector } from './priority-selector';
import { ProjectBadge } from './project-badge';
import { StatusSelector } from './status-selector';
import { SubIssueProgress } from './sub-issue-progress';
import { ParentIssueChip } from './parent-issue-chip';
import { SlaBadge } from './sla-badge';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IssueContextMenu } from './issue-context-menu';
import { useInIssueMenuHost } from './issue-context-menu-host';
import type { IssueGroupContext } from './group-issues';
import { IssueDragType, useIssueDropTarget } from './use-issue-drop-target';

export { IssueDragType };
type IssueGridProps = {
   issue: Issue;
   /** Grupo do card e suas issues — lido no drop (reorder/move). Getter estável (não o
    *  array), para o drop não re-registrar a cada mudança do grupo. */
   getGroup: () => IssueGroupContext;
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
               <AssigneeUser compact users={issue.assignees} issueId={issue.id} />
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

function IssueGridComponent({ issue, getGroup, layout = true }: IssueGridProps) {
   const ref = useRef<HTMLDivElement>(null);
   const { orgId } = useParams<{ orgId: string }>();
   const displayProperties = useDisplaySetting('displayProperties');
   const inMenuHost = useInIssueMenuHost();
   // is#10: no board a seleção era invisível — sem caixa e sem destaque no card.
   const selected = useBulkSelectionStore((s) => s.selected.has(issue.id));
   const anySelected = useBulkSelectionStore((s) => s.selected.size > 0);
   const toggleSelected = useBulkSelectionStore((s) => s.toggle);
   const selectRange = useBulkSelectionStore((s) => s.selectRange);
   const pick = (e: { shiftKey: boolean }) => {
      const ordered = getGroup?.().issues.map((i) => i.id);
      if (e.shiftKey && ordered) selectRange(ordered, issue.id);
      else toggleSelected(issue.id);
   };

   // Set up drag functionality.
   // Deps [issue]: sem elas o item arrastado ficava congelado na 1ª versão da issue.
   const [{ isDragging }, drag, preview] = useDrag(
      () => ({
         type: IssueDragType,
         item: issue,
         collect: (monitor: DragSourceMonitor) => ({
            isDragging: monitor.isDragging(),
         }),
      }),
      [issue]
   );

   // Use empty image as drag preview (we'll create a custom one with DragLayer)
   useEffect(() => {
      preview(getEmptyImage(), { captureDraggingState: true });
   }, [preview]);

   // Drop sobre o card: reorder no grupo ou campo do agrupamento (R2). O resultado
   // sinaliza `didDrop()` ao container, que então não trata de novo.
   const { drop } = useIssueDropTarget(issue.id, getGroup, ref);

   // Connect drag and drop to the element.
   drag(drop(ref));

   // Sem animação de layout (coluna virtualizada): div simples, sem o runtime do motion.
   const Card = layout ? motion.div : 'div';

   const card = (
      <Card
         ref={ref}
         data-issue-id={issue.id}
         className={cn(
            'group/card w-full cursor-default rounded-lg bg-card p-2 shadow-[var(--card-shadow)]',
            selected && 'ring-2 ring-primary'
         )}
         {...(layout && { layoutId: `issue-grid-${issue.identifier || issue.id}` })}
         style={{
            opacity: isDragging ? 0.5 : 1,
            cursor: isDragging ? 'grabbing' : 'default',
         }}
      >
         {/* Bloco superior: conteúdo à esquerda e assignee fixo no canto. */}
         <div className="relative mb-2.5 h-[37px]">
            <button
               type="button"
               onClick={pick}
               aria-label={selected ? 'Deselect issue' : 'Select issue'}
               aria-pressed={selected}
               className={cn(
                  'absolute -left-0.5 top-0 z-10 flex size-4 items-center justify-center rounded border transition-opacity',
                  selected
                     ? 'border-primary bg-primary text-primary-foreground opacity-100'
                     : 'border-border text-transparent opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100',
                  anySelected && 'opacity-100'
               )}
            >
               <Check className="size-3" />
            </button>
            <div className={cn('flex h-[37px] flex-col pr-[34px]', anySelected ? 'pl-5' : 'pl-1')}>
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
                  <MaybeLink
                     href={
                        issue.identifier ? `/${orgId ?? 'nimbloo'}/issue/${issue.identifier}` : null
                     }
                     className="min-w-0"
                  >
                     <h3 className="line-clamp-2 text-[13px] font-medium leading-4">
                        {issue.parentIdentifier && (
                           <ParentIssueChip identifier={issue.parentIdentifier} />
                        )}
                        {issue.title}
                     </h3>
                  </MaybeLink>
               </div>
            </div>
            {displayProperties.assignee && (
               <div className="absolute right-0 top-0">
                  <AssigneeUser compact users={issue.assignees} issueId={issue.id} />
               </div>
            )}
         </div>
         {/* Propriedades */}
         <div className="flex min-h-6 flex-wrap items-center gap-1">
            {displayProperties.priority && (
               <PrioritySelector compact priority={issue.priority} issueId={issue.id} />
            )}
            {displayProperties.labels && <LabelBadge label={issue.labels} />}
            {displayProperties.project && issue.project && <ProjectBadge project={issue.project} />}
            <SlaBadge issue={issue} />
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
      </Card>
   );

   // No board o menu de contexto é um só (R7); card avulso monta o seu.
   if (inMenuHost) return card;
   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
         <IssueContextMenu issueId={issue.id} />
      </ContextMenu>
   );
}

/** Memoizado: um evento de outra issue não re-renderiza os cards montados (#2). As props
 *  são estáveis — a issue inalterada mantém a referência e `getGroup` é getter. */
export const IssueGrid = memo(IssueGridComponent);
