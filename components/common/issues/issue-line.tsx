'use client';

import { Issue } from '@/data/issues';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useDisplaySetting } from '@/store/display-settings-store';
import { useBulkSelectionStore } from '@/store/bulk-selection-store';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AssigneeUser } from './assignee-user';
import { LabelBadge } from './label-badge';
import { PrioritySelector } from './priority-selector';
import { ProjectBadge } from './project-badge';
import { StatusSelector } from './status-selector';
import { SubIssueProgress } from './sub-issue-progress';
import { ParentIssueChip } from './parent-issue-chip';
import { estimateLabel, normalizeScale } from '@/data/estimate-scales';
import { motion } from 'motion/react';
import { memo } from 'react';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IssueContextMenu } from './issue-context-menu';

function IssueLineComponent({ issue, layoutId = false }: { issue: Issue; layoutId?: boolean }) {
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

   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>
            <motion.div
               {...(layoutId && { layoutId: `issue-line-${issue.identifier}` })}
               className={cn(
                  'group/line flex h-11 w-full items-center justify-start px-3 hover:bg-accent/40 focus-within:bg-accent/40',
                  selected && 'bg-primary/5'
               )}
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
                     {displayProperties.labels && <LabelBadge label={issue.labels} />}
                     {displayProperties.project && issue.project && (
                        <ProjectBadge project={issue.project} />
                     )}
                  </div>
                  <SubIssueProgress count={issue.subIssueCount} done={issue.subIssueDoneCount} />
                  {displayProperties.estimate && issue.estimate !== undefined && (
                     <span className="text-xs text-muted-foreground border border-border rounded-md px-1.5 py-0.5 shrink-0 hidden sm:inline-block tabular-nums">
                        {estimateLabel(issue.estimate, normalizeScale(team?.estimateScale))}
                     </span>
                  )}
                  {cycle && (
                     <span className="text-xs text-muted-foreground border border-border rounded-md px-1.5 py-0.5 shrink-0 hidden lg:inline-block">
                        {cycle.name}
                     </span>
                  )}
                  {displayProperties.dueDate && issue.dueDate && (
                     <span className="hidden shrink-0 text-xs text-destructive sm:inline-block">
                        Due {format(new Date(issue.dueDate), 'MMM dd')}
                     </span>
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

/** Memoizada: só re-renderiza quando `issue`/`layoutId` mudam — importante na lista
 *  virtualizada, onde o container re-renderiza ao rolar (evita re-render das linhas). */
export const IssueLine = memo(IssueLineComponent);
