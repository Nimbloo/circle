'use client';

import { Issue } from '@/data/issues';
import { LabelInterface } from '@/data/labels';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useDisplaySetting } from '@/store/display-settings-store';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { useIssuesStore } from '@/store/issues-store';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AssigneeUser } from './assignee-user';
import { CycleSelector } from './cycle-selector';
import { LabelBadge } from './label-badge';
import { PrioritySelector } from './priority-selector';
import { StatusSelector } from './status-selector';
import { SubIssueProgress } from './sub-issue-progress';
import { ParentIssueChip } from './parent-issue-chip';
import { SlaBadge } from './sla-badge';
import { IssueDragType } from './issue-grid';
import { LabelSelector } from '@/components/layout/sidebar/create-new-issue/label-selector';
import { ProjectSelector } from '@/components/layout/sidebar/create-new-issue/project-selector';
import { EstimateSelector } from '@/components/layout/sidebar/create-new-issue/estimate-selector';
import { DueDateSelector } from '@/components/layout/sidebar/create-new-issue/due-date-selector';
import { estimateLabel, normalizeScale } from '@/data/estimate-scales';
import { motion } from 'motion/react';
import { memo, useEffect, useRef, type Ref } from 'react';
import { DragSourceMonitor, useDrag, useDrop } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IssueContextMenu } from './issue-context-menu';

interface IssueLineProps {
   issue: Issue;
   layoutId?: boolean;
   /**
    * Issues do grupo na ordem de exibição — liga o drag-and-drop da linha (reordenar no
    * grupo; soltar em outro grupo de status muda o status). Ausente (busca, listas fora
    * de um `DndProvider`): linha estática.
    */
   orderedIssues?: Issue[];
}

type IssueDropResult = { handled: true };

/** Chip de propriedade clicável (padrão Linear): mesmo visual do badge, abre o seletor. */
const propertyChipClass =
   'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground';

function IssueRow({
   ref,
   issue,
   layoutId = false,
   dragging = false,
}: {
   ref?: Ref<HTMLDivElement>;
   issue: Issue;
   layoutId?: boolean;
   dragging?: boolean;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   // Selector estreito: assina só displayProperties (não o store inteiro) — senão toda
   // linha memoizada re-renderiza a qualquer mudança do display-store (ex.: showEmptyGroups).
   const displayProperties = useDisplaySetting('displayProperties');
   // Chamada DENTRO do seletor (referencia estavel: `find`), senao a linha nao
   // acorda quando o ciclo muda.
   const cycle = useWorkspaceStore((s) =>
      displayProperties.cycle && issue.cycleId ? s.getCycleById(issue.cycleId) : undefined
   );
   const team = useWorkspaceStore((s) => (issue.teamId ? s.getTeamById(issue.teamId) : undefined));
   const selected = useBulkSelectionStore((s) => s.selected.has(issue.id));
   const anySelected = useBulkSelectionStore((s) => s.selected.size > 0);
   const toggleSelected = useBulkSelectionStore((s) => s.toggle);
   const updateIssue = useIssuesStore((s) => s.updateIssue);
   const updateIssueProject = useIssuesStore((s) => s.updateIssueProject);
   const addIssueLabel = useIssuesStore((s) => s.addIssueLabel);
   const removeIssueLabel = useIssuesStore((s) => s.removeIssueLabel);

   // O seletor devolve o conjunto; o store persiste por delta (add/remove), otimista.
   const changeLabels = (next: LabelInterface[]) => {
      const current = new Set(issue.labels.map((l) => l.id));
      const wanted = new Set(next.map((l) => l.id));
      next
         .filter((l) => !current.has(l.id))
         .forEach((l) => void addIssueLabel(issue.id, l).catch(() => undefined));
      issue.labels
         .filter((l) => !wanted.has(l.id))
         .forEach((l) => void removeIssueLabel(issue.id, l.id).catch(() => undefined));
   };

   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>
            <motion.div
               ref={ref}
               {...(layoutId && { layoutId: `issue-line-${issue.identifier}` })}
               className={cn(
                  'group/line flex h-11 w-full items-center justify-start px-3 hover:bg-accent/40 focus-within:bg-accent/40',
                  selected && 'bg-primary/5'
               )}
               style={dragging ? { opacity: 0.5, cursor: 'grabbing' } : undefined}
            >
               <button
                  type="button"
                  onClick={() => toggleSelected(issue.id)}
                  aria-label={selected ? 'Deselect issue' : 'Select issue'}
                  aria-pressed={selected}
                  className={cn(
                     'mr-1.5 shrink-0 size-4 rounded border flex items-center justify-center transition-opacity',
                     selected
                        ? 'bg-primary border-primary text-primary-foreground opacity-100'
                        : 'border-border text-transparent opacity-0 group-hover/line:opacity-100 group-focus-within/line:opacity-100',
                     anySelected && 'opacity-100'
                  )}
               >
                  <Check className="size-3" />
               </button>
               <div className="flex items-center gap-0.5">
                  {displayProperties.priority && (
                     <PrioritySelector priority={issue.priority} issueId={issue.id} />
                  )}
                  {displayProperties.id && (
                     <span className="mr-0.5 hidden w-[66px] shrink-0 truncate text-xs tabular-nums text-muted-foreground sm:inline-block">
                        {issue.identifier}
                     </span>
                  )}
                  {displayProperties.status && (
                     <StatusSelector status={issue.status} issueId={issue.id} />
                  )}
               </div>
               <Link
                  href={`/${orgId ?? 'nimbloo'}/issue/${issue.identifier}`}
                  className="min-w-0 flex items-center justify-start mr-1 ml-0.5"
               >
                  {issue.parentIdentifier && (
                     <ParentIssueChip identifier={issue.parentIdentifier} />
                  )}
                  <span className="truncate text-[13px] font-medium">{issue.title}</span>
               </Link>
               <div className="flex items-center justify-end gap-2 ml-auto sm:w-fit">
                  <div className="w-3 shrink-0"></div>
                  <div className="-space-x-5 hover:space-x-1 lg:space-x-1 items-center justify-end hidden sm:flex duration-200 transition-all">
                     {displayProperties.labels && issue.labels.length > 0 && (
                        <LabelSelector selectedLabels={issue.labels} onChange={changeLabels}>
                           <button
                              type="button"
                              aria-label="Change labels"
                              className="flex items-center gap-1 rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                           >
                              <LabelBadge label={issue.labels} />
                           </button>
                        </LabelSelector>
                     )}
                     {displayProperties.project && issue.project && (
                        <ProjectSelector
                           project={issue.project}
                           onChange={(project) =>
                              void updateIssueProject(issue.id, project).catch(() => undefined)
                           }
                        >
                           <button
                              type="button"
                              aria-label={`Change project: ${issue.project.name}`}
                              className={propertyChipClass}
                           >
                              <issue.project.icon size={16} />
                              {issue.project.name}
                           </button>
                        </ProjectSelector>
                     )}
                  </div>
                  <SlaBadge issue={issue} />
                  <SubIssueProgress count={issue.subIssueCount} done={issue.subIssueDoneCount} />
                  {displayProperties.estimate && issue.estimate !== undefined && (
                     <EstimateSelector
                        estimate={issue.estimate}
                        teamId={issue.teamId}
                        onChange={(estimate) =>
                           void updateIssue(issue.id, { estimate }).catch(() => undefined)
                        }
                     >
                        <button
                           type="button"
                           aria-label="Change estimate"
                           className={cn(
                              propertyChipClass,
                              'hidden rounded-md tabular-nums sm:inline-flex'
                           )}
                        >
                           {estimateLabel(issue.estimate, normalizeScale(team?.estimateScale))}
                        </button>
                     </EstimateSelector>
                  )}
                  {cycle && (
                     <CycleSelector issue={issue}>
                        <button
                           type="button"
                           aria-label={`Change cycle: ${cycle.name}`}
                           className={cn(propertyChipClass, 'hidden rounded-md lg:inline-flex')}
                        >
                           {cycle.name}
                        </button>
                     </CycleSelector>
                  )}
                  {displayProperties.dueDate && issue.dueDate && (
                     <DueDateSelector
                        dueDate={issue.dueDate}
                        onChange={(dueDate) =>
                           void updateIssue(issue.id, { dueDate }).catch(() => undefined)
                        }
                     >
                        <button
                           type="button"
                           aria-label="Change due date"
                           className="hidden shrink-0 rounded text-xs text-destructive outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:inline-block"
                        >
                           Due {format(new Date(issue.dueDate), 'MMM dd')}
                        </button>
                     </DueDateSelector>
                  )}
                  {/* Padrão Linear: avatar do assignee ANTES da data */}
                  {displayProperties.assignee && (
                     <AssigneeUser users={issue.assignees} issueId={issue.id} />
                  )}
                  {displayProperties.created && (
                     <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline-block">
                        {format(new Date(issue.createdAt), 'MMM d')}
                     </span>
                  )}
               </div>
            </motion.div>
         </ContextMenuTrigger>
         <IssueContextMenu issueId={issue.id} />
      </ContextMenu>
   );
}

/**
 * Linha arrastável (mesmo protocolo do card do board, `issue-grid.tsx`): soltar sobre
 * outra linha reordena por rank entre os vizinhos; soltar sobre linha de outro status
 * adota o status dela. Exige um `DndProvider` acima (grouped-issues-view).
 */
function DraggableIssueRow({
   issue,
   layoutId,
   orderedIssues,
}: {
   issue: Issue;
   layoutId?: boolean;
   orderedIssues: Issue[];
}) {
   const ref = useRef<HTMLDivElement>(null);
   const reorderIssue = useIssuesStore((s) => s.reorderIssue);
   const updateIssueStatus = useIssuesStore((s) => s.updateIssueStatus);

   const [{ isDragging }, drag, preview] = useDrag(
      () => ({
         type: IssueDragType,
         item: issue,
         collect: (monitor: DragSourceMonitor) => ({ isDragging: monitor.isDragging() }),
      }),
      [issue]
   );

   // Preview custom (CustomDragLayer) em vez do ghost nativo do browser.
   useEffect(() => {
      preview(getEmptyImage(), { captureDraggingState: true });
   }, [preview]);

   const [, drop] = useDrop<Issue, IssueDropResult, unknown>(
      () => ({
         accept: IssueDragType,
         drop(item, monitor): IssueDropResult | undefined {
            if (item.id === issue.id) return { handled: true };

            // Grupo diferente: adota o status da linha-alvo.
            if (item.status.id !== issue.status.id) {
               void updateIssueStatus(item.id, issue.status).catch(() => undefined);
               return { handled: true };
            }

            // Mesmo grupo: reordena por rank entre os vizinhos do alvo (exclui o arrastado).
            const list = orderedIssues.filter((i) => i.id !== item.id);
            const targetIdx = list.findIndex((i) => i.id === issue.id);
            if (targetIdx === -1) return { handled: true };

            const rect = ref.current?.getBoundingClientRect();
            const pointerY = monitor.getClientOffset()?.y ?? 0;
            const dropAbove = rect ? pointerY < rect.top + rect.height / 2 : false;

            // asc(rank): index menor = rank menor = acima.
            const beforeId = dropAbove ? (list[targetIdx - 1]?.id ?? null) : issue.id;
            const afterId = dropAbove ? issue.id : (list[targetIdx + 1]?.id ?? null);
            reorderIssue(item.id, beforeId, afterId);
            return { handled: true };
         },
      }),
      [issue, orderedIssues, reorderIssue, updateIssueStatus]
   );

   drag(drop(ref));

   return <IssueRow ref={ref} issue={issue} layoutId={layoutId} dragging={isDragging} />;
}

function IssueLineComponent({ issue, layoutId = false, orderedIssues }: IssueLineProps) {
   return orderedIssues ? (
      <DraggableIssueRow issue={issue} layoutId={layoutId} orderedIssues={orderedIssues} />
   ) : (
      <IssueRow issue={issue} layoutId={layoutId} />
   );
}

/** Memoizada: só re-renderiza quando as props mudam — importante na lista
 *  virtualizada, onde o container re-renderiza ao rolar (evita re-render das linhas). */
export const IssueLine = memo(IssueLineComponent);
