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
import { MaybeLink } from './maybe-link';
import { useParams } from 'next/navigation';
import { AssigneeUser } from './assignee-user';
import { CycleSelector } from './cycle-selector';
import { LabelBadge } from './label-badge';
import { PrioritySelector } from './priority-selector';
import { StatusSelector } from './status-selector';
import { SubIssueProgress } from './sub-issue-progress';
import { ParentIssueChip } from './parent-issue-chip';
import { SlaBadge } from './sla-badge';
import { DUE_DATE_TONE_CLASS, dueDateLabel, dueDateTone } from './due-date';
import type { IssueGroupContext } from './group-issues';
import { IssueDragType, useIssueDropTarget } from './use-issue-drop-target';
import { LabelSelector } from '@/components/layout/sidebar/create-new-issue/label-selector';
import { ProjectSelector } from '@/components/layout/sidebar/create-new-issue/project-selector';
import { EstimateSelector } from '@/components/layout/sidebar/create-new-issue/estimate-selector';
import { DueDateSelector } from '@/components/layout/sidebar/create-new-issue/due-date-selector';
import { estimateLabel, normalizeScale } from '@/data/estimate-scales';
import { motion } from 'motion/react';
import {
   createContext,
   memo,
   useContext,
   useEffect,
   useRef,
   type ReactNode,
   type Ref,
} from 'react';
import { DragSourceMonitor, useDrag, useDragLayer } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IssueContextMenu } from './issue-context-menu';
import { useInIssueMenuHost } from './issue-context-menu-host';

interface IssueLineProps {
   issue: Issue;
   layoutId?: boolean;
   /**
    * Grupo da linha e suas issues — liga o drag-and-drop (reordenar no grupo; soltar em
    * outro grupo aplica o campo do agrupamento). Ausente (busca, listas fora de um
    * `DndProvider`): linha estática. É um getter ESTÁVEL (não o array): o array muda a
    * cada evento e derrubaria o `memo` de todas as linhas do grupo.
    */
   getGroup?: () => IssueGroupContext;
}

/** Chip de propriedade clicável (padrão Linear): mesmo visual do badge, abre o seletor. */
const propertyChipClass =
   'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground';

/**
 * Projeto da tela atual (ex.: aba Issues de `/project/:id`). Dentro desse escopo, o
 * chip de projeto da própria linha é redundante (e quebra em 2 linhas) — some só
 * quando o projeto da issue É o projeto da tela; outras listas seguem mostrando.
 */
const IssueLineProjectScopeContext = createContext<string | null>(null);

export function IssueLineProjectScopeProvider({
   projectId,
   children,
}: {
   projectId?: string | null;
   children: ReactNode;
}) {
   return (
      <IssueLineProjectScopeContext.Provider value={projectId ?? null}>
         {children}
      </IssueLineProjectScopeContext.Provider>
   );
}

function IssueRow({
   ref,
   issue,
   layoutId = false,
   dragging = false,
   dropIndicator = null,
   getGroup,
}: {
   ref?: Ref<HTMLDivElement>;
   issue: Issue;
   layoutId?: boolean;
   dragging?: boolean;
   /** Linha de inserção de 2px (is#21): onde a issue arrastada vai cair ao soltar aqui. */
   dropIndicator?: 'above' | 'below' | null;
   getGroup?: () => IssueGroupContext;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   // Selector estreito: assina só displayProperties (não o store inteiro) — senão toda
   // linha memoizada re-renderiza a qualquer mudança do display-store (ex.: showEmptyGroups).
   const displayProperties = useDisplaySetting('displayProperties');
   const scopeProjectId = useContext(IssueLineProjectScopeContext);
   const showProjectChip =
      displayProperties.project && !!issue.project && issue.project.id !== scopeProjectId;
   // Chamada DENTRO do seletor (referencia estavel: `find`), senao a linha nao
   // acorda quando o ciclo muda.
   const cycle = useWorkspaceStore((s) =>
      displayProperties.cycle && issue.cycleId ? s.getCycleById(issue.cycleId) : undefined
   );
   const team = useWorkspaceStore((s) => (issue.teamId ? s.getTeamById(issue.teamId) : undefined));
   const selected = useBulkSelectionStore((s) => s.selected.has(issue.id));
   const anySelected = useBulkSelectionStore((s) => s.selected.size > 0);
   const toggleSelected = useBulkSelectionStore((s) => s.toggle);
   const selectRange = useBulkSelectionStore((s) => s.selectRange);
   // Shift+clique seleciona o intervalo dentro do grupo visível (is#10).
   const pick = (e: { shiftKey: boolean }) => {
      const ordered = getGroup?.().issues.map((i) => i.id);
      if (e.shiftKey && ordered) selectRange(ordered, issue.id);
      else toggleSelected(issue.id);
   };
   const updateIssue = useIssuesStore((s) => s.updateIssue);
   const updateIssueProject = useIssuesStore((s) => s.updateIssueProject);
   const addIssueLabel = useIssuesStore((s) => s.addIssueLabel);
   const removeIssueLabel = useIssuesStore((s) => s.removeIssueLabel);
   const inMenuHost = useInIssueMenuHost();

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

   // Sem layoutId não há animação: div simples, sem o runtime do motion por linha.
   const Row = layoutId ? motion.div : 'div';

   const row = (
      <Row
         ref={ref}
         data-issue-id={issue.id}
         {...(layoutId && { layoutId: `issue-line-${issue.identifier || issue.id}` })}
         className={cn(
            'group/line relative flex h-11 w-full items-center justify-start px-3 hover:bg-accent/40 focus-within:bg-accent/40',
            selected && 'bg-primary/5'
         )}
         style={dragging ? { opacity: 0.5, cursor: 'grabbing' } : undefined}
      >
         {dropIndicator && (
            <span
               aria-hidden
               data-testid="drop-indicator"
               className={cn(
                  'pointer-events-none absolute inset-x-0 h-0.5 bg-primary',
                  dropIndicator === 'above' ? 'top-0' : 'bottom-0'
               )}
            />
         )}
         <button
            type="button"
            onClick={pick}
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
         {/* Issue otimista ainda sem identifier (Is#17): sem link até o servidor responder. */}
         <MaybeLink
            href={issue.identifier ? `/${orgId ?? 'nimbloo'}/issue/${issue.identifier}` : null}
            className="min-w-0 flex items-center justify-start mr-1 ml-0.5"
         >
            {issue.parentIdentifier && <ParentIssueChip identifier={issue.parentIdentifier} />}
            <span className="truncate text-[13px] font-medium">{issue.title}</span>
         </MaybeLink>
         <div className="flex items-center justify-end gap-2 ml-auto sm:w-fit">
            <div className="w-3 shrink-0"></div>
            <div className="-space-x-5 hover:space-x-1 lg:space-x-1 items-center justify-end hidden sm:flex">
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
               {showProjectChip && issue.project && (
                  <ProjectSelector
                     project={issue.project}
                     teamId={issue.teamId}
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
                     className={cn(
                        'hidden shrink-0 rounded text-xs outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:inline-block',
                        DUE_DATE_TONE_CLASS[dueDateTone(issue.dueDate)]
                     )}
                  >
                     Due {dueDateLabel(issue.dueDate)}
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
      </Row>
   );

   // Dentro da lista, o menu de contexto é um só (R7); linha avulsa (busca) monta o seu.
   if (inMenuHost) return row;
   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
         <IssueContextMenu issueId={issue.id} />
      </ContextMenu>
   );
}

/**
 * Linha arrastável (mesmo protocolo do card do board, `issue-grid.tsx`): soltar sobre
 * outra linha do grupo reordena por rank; sobre linha de outro grupo aplica o campo do
 * agrupamento (`useIssueDropTarget`). Exige um `DndProvider` acima (grouped-issues-view).
 */
function DraggableIssueRow({
   issue,
   layoutId,
   getGroup,
}: {
   issue: Issue;
   layoutId?: boolean;
   getGroup: () => IssueGroupContext;
}) {
   const ref = useRef<HTMLDivElement>(null);

   const [{ isDragging }, drag, preview] = useDrag(
      () => ({
         type: IssueDragType,
         item: issue,
         collect: (monitor: DragSourceMonitor) => ({ isDragging: monitor.isDragging() }),
      }),
      [issue]
   );

   // Preview custom (IssueLineDragLayer) em vez do ghost nativo do browser.
   useEffect(() => {
      preview(getEmptyImage(), { captureDraggingState: true });
   }, [preview]);

   const { drop, isOver, dropAbove } = useIssueDropTarget(issue.id, getGroup, ref);
   drag(drop(ref));

   return (
      <IssueRow
         ref={ref}
         issue={issue}
         layoutId={layoutId}
         dragging={isDragging}
         dropIndicator={isOver ? (dropAbove ? 'above' : 'below') : null}
         getGroup={getGroup}
      />
   );
}

function IssueLineComponent({ issue, layoutId = false, getGroup }: IssueLineProps) {
   return getGroup ? (
      <DraggableIssueRow issue={issue} layoutId={layoutId} getGroup={getGroup} />
   ) : (
      <IssueRow issue={issue} layoutId={layoutId} />
   );
}

/** Memoizada: só re-renderiza quando as props mudam — importante na lista
 *  virtualizada, onde o container re-renderiza ao rolar (evita re-render das linhas). */
export const IssueLine = memo(IssueLineComponent);

/**
 * Fantasma do drag na lista (is#21): antes, a lista reaproveitava o card do board
 * (`CustomDragLayer`, issue-grid.tsx) — largo demais e com o layout errado. Aqui o
 * fantasma tem a cara de uma linha.
 */
export function IssueLineDragLayer() {
   const { itemType, isDragging, item, currentOffset } = useDragLayer((monitor) => ({
      item: monitor.getItem() as Issue,
      itemType: monitor.getItemType(),
      currentOffset: monitor.getSourceClientOffset(),
      isDragging: monitor.isDragging(),
   }));

   if (!isDragging || itemType !== IssueDragType || !currentOffset || !item) {
      return null;
   }

   return (
      <div
         className="fixed left-0 top-0 z-50 pointer-events-none"
         style={{
            transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
            width: '420px',
         }}
      >
         <div className="flex h-11 items-center gap-2 rounded-md border border-border bg-card px-3 shadow-[var(--card-shadow)]">
            <item.status.icon />
            <span className="truncate text-[13px] font-medium">{item.title}</span>
         </div>
      </div>
   );
}
