'use client';

import { Issue } from '@/mock-data/issues';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
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
import { motion } from 'motion/react';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IssueContextMenu } from './issue-context-menu';

export function IssueLine({ issue, layoutId = false }: { issue: Issue; layoutId?: boolean }) {
   const { orgId } = useParams<{ orgId: string }>();
   const { displayProperties } = useDisplaySettingsStore();
   const getCycleById = useWorkspaceStore((s) => s.getCycleById);
   const cycle = displayProperties.cycle && issue.cycleId ? getCycleById(issue.cycleId) : undefined;
   const selected = useBulkSelectionStore((s) => s.selected.has(issue.id));
   const anySelected = useBulkSelectionStore((s) => s.selected.size > 0);
   const toggleSelected = useBulkSelectionStore((s) => s.toggle);

   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>
            <motion.div
               {...(layoutId && { layoutId: `issue-line-${issue.identifier}` })}
               className={cn(
                  'group/line w-full flex items-center justify-start h-11 px-6 hover:bg-sidebar/50',
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
                        : 'border-border text-transparent opacity-0 group-hover/line:opacity-100',
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
                     <span className="text-sm hidden sm:inline-block text-muted-foreground font-medium w-[66px] truncate shrink-0 mr-0.5">
                        {issue.identifier}
                     </span>
                  )}
                  {displayProperties.status && (
                     <StatusSelector status={issue.status} issueId={issue.id} />
                  )}
               </div>
               <Link
                  href={`/${orgId ?? 'lndev-ui'}/issue/${issue.identifier}`}
                  className="min-w-0 flex items-center justify-start mr-1 ml-0.5"
               >
                  <span className="text-xs sm:text-sm font-medium sm:font-semibold truncate">
                     {issue.title}
                  </span>
               </Link>
               <div className="flex items-center justify-end gap-2 ml-auto sm:w-fit">
                  <div className="w-3 shrink-0"></div>
                  <div className="-space-x-5 hover:space-x-1 lg:space-x-1 items-center justify-end hidden sm:flex duration-200 transition-all">
                     {displayProperties.labels && <LabelBadge label={issue.labels} />}
                     {displayProperties.project && issue.project && (
                        <ProjectBadge project={issue.project} />
                     )}
                  </div>
                  {displayProperties.estimate && issue.estimate !== undefined && (
                     <span className="text-xs text-muted-foreground border border-border rounded-md px-1.5 py-0.5 shrink-0 hidden sm:inline-block tabular-nums">
                        {issue.estimate}
                     </span>
                  )}
                  {cycle && (
                     <span className="text-xs text-muted-foreground border border-border rounded-md px-1.5 py-0.5 shrink-0 hidden lg:inline-block">
                        {cycle.name}
                     </span>
                  )}
                  {displayProperties.dueDate && issue.dueDate && (
                     <span className="text-xs text-orange-400 shrink-0 hidden sm:inline-block">
                        Due {format(new Date(issue.dueDate), 'MMM dd')}
                     </span>
                  )}
                  {displayProperties.created && (
                     <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline-block">
                        {format(new Date(issue.createdAt), 'MMM dd')}
                     </span>
                  )}
                  {displayProperties.assignee && <AssigneeUser user={issue.assignee} />}
               </div>
            </motion.div>
         </ContextMenuTrigger>
         <IssueContextMenu issueId={issue.id} />
      </ContextMenu>
   );
}
