'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useIssuesStore } from '@/store/issues-store';
import { IssueDetail } from '@/data/issue-details';
import { Issue } from '@/data/issues';
import { LabelInterface } from '@/data/labels';
import { Ban, Bell, BellOff, CheckIcon, GitPullRequestArrow } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { LabelBadge } from '../label-badge';
import { PrioritySelector } from '../priority-selector';
import { StatusSelector } from '../status-selector';
import { AssigneeSelector } from '@/components/layout/sidebar/create-new-issue/assignee-selector';
import { LabelSelector } from '@/components/layout/sidebar/create-new-issue/label-selector';
import { EstimateSelector } from '@/components/layout/sidebar/create-new-issue/estimate-selector';
import { DueDateSelector } from '@/components/layout/sidebar/create-new-issue/due-date-selector';
import { IssueRefRow } from './content-blocks';
import { RelationEditor } from './relation-editor';

/** Selector de ciclo do time da issue (reusa updateIssue({cycleId}) do store). */
function CycleSelector({ issue }: { issue: Issue }) {
   const [open, setOpen] = useState(false);
   const getCyclesByTeam = useWorkspaceStore((s) => s.getCyclesByTeam);
   const getCycleById = useWorkspaceStore((s) => s.getCycleById);
   const updateIssue = useIssuesStore((s) => s.updateIssue);

   const teamId = issue.identifier.split('-')[0];
   const cycles = getCyclesByTeam(teamId);
   const current = issue.cycleId ? getCycleById(issue.cycleId) : undefined;

   const select = (cycleId: string) => {
      setOpen(false);
      if (cycleId !== issue.cycleId) updateIssue(issue.id, { cycleId });
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-2 px-1.5 -ml-1.5 justify-start">
               <CyclePlayIcon className="size-4" />
               <span className="text-sm">{current ? current.name : 'No cycle'}</span>
            </Button>
         </PopoverTrigger>
         <PopoverContent className="border-input w-64 p-0" align="start">
            <Command>
               <CommandInput placeholder="Set cycle..." />
               <CommandList>
                  <CommandEmpty>No cycles found.</CommandEmpty>
                  <CommandGroup>
                     <CommandItem value="no-cycle" onSelect={() => select('')}>
                        <CyclePlayIcon className="size-4" />
                        <span>No cycle</span>
                        {!issue.cycleId && <CheckIcon size={16} className="ml-auto" />}
                     </CommandItem>
                     {cycles.map((cycle) => (
                        <CommandItem
                           key={cycle.id}
                           value={`${cycle.name} ${cycle.id}`}
                           onSelect={() => select(cycle.id)}
                        >
                           <CyclePlayIcon className="size-4" />
                           <span className="truncate">{cycle.name}</span>
                           {issue.cycleId === cycle.id && (
                              <CheckIcon size={16} className="ml-auto" />
                           )}
                        </CommandItem>
                     ))}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

interface IssuePropertiesPanelProps {
   issue: Issue;
   detail: IssueDetail;
   /** Quando fornecido, as relações (related/blocked-by) ficam editáveis e o pai refetch. */
   onChanged?: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
   return (
      <div>
         <h3 className="text-xs font-medium text-muted-foreground mb-2">{title}</h3>
         {children}
      </div>
   );
}

/**
 * Right sidebar of the issue page: editable properties (status, priority,
 * assignee), cycle, labels, project + milestone, relations and linked PRs.
 */
export function IssuePropertiesPanel({ issue, detail, onChanged }: IssuePropertiesPanelProps) {
   const updateIssue = useIssuesStore((s) => s.updateIssue);
   const updateIssueAssignee = useIssuesStore((s) => s.updateIssueAssignee);
   const addIssueLabel = useIssuesStore((s) => s.addIssueLabel);
   const removeIssueLabel = useIssuesStore((s) => s.removeIssueLabel);
   const subscribed = useWorkspaceStore(
      (s) => s.me?.subscribedIssueIds.includes(issue.id) ?? false
   );
   const toggleSubscription = useWorkspaceStore((s) => s.toggleSubscription);

   const [editingMs, setEditingMs] = useState(false);
   const [msDraft, setMsDraft] = useState('');
   const saveMilestone = async () => {
      setEditingMs(false);
      try {
         await api.issues.updateDetail(issue.id, { milestone: msDraft.trim() || null });
         await onChanged?.();
      } catch {
         toast.error('Could not update the milestone');
      }
   };

   // Diff entre a seleção do LabelSelector e as labels atuais → add/remove no store.
   const onLabelsChange = (next: LabelInterface[]) => {
      next
         .filter((l) => !issue.labels.some((c) => c.id === l.id))
         .forEach((l) => addIssueLabel(issue.id, l));
      issue.labels
         .filter((c) => !next.some((l) => l.id === c.id))
         .forEach((c) => removeIssueLabel(issue.id, c.id));
   };

   return (
      <div className="flex flex-col gap-7">
         <button
            type="button"
            onClick={() => toggleSubscription(issue.id)}
            aria-pressed={subscribed}
            className={cn(
               'flex items-center gap-2 h-8 px-2 -mx-2 rounded-md text-sm transition-colors hover:bg-accent/50',
               subscribed ? 'text-foreground' : 'text-muted-foreground'
            )}
         >
            {subscribed ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            {subscribed ? 'Subscribed' : 'Subscribe'}
         </button>

         <Section title="Properties">
            <div className="flex flex-col gap-1.5">
               <div className="flex items-center gap-1.5 -ml-1.5">
                  <StatusSelector status={issue.status} issueId={issue.id} />
                  <span className="text-sm">{issue.status.name}</span>
               </div>
               <div className="flex items-center gap-1.5 -ml-1.5">
                  <PrioritySelector priority={issue.priority} issueId={issue.id} />
                  <span className="text-sm">{issue.priority.name}</span>
               </div>
               <div className="flex items-center gap-1.5 -ml-0.5 mt-0.5">
                  <AssigneeSelector
                     assignee={issue.assignee}
                     onChange={(assignee) => updateIssueAssignee(issue.id, assignee)}
                  />
               </div>
               <div className="mt-0.5">
                  <CycleSelector issue={issue} />
               </div>
               <div className="flex items-center gap-1.5 -ml-1.5 mt-0.5">
                  <EstimateSelector
                     estimate={issue.estimate}
                     teamId={issue.teamId}
                     onChange={(estimate) => updateIssue(issue.id, { estimate })}
                  />
               </div>
               <div className="flex items-center gap-1.5 -ml-1.5 mt-0.5">
                  <DueDateSelector
                     dueDate={issue.dueDate}
                     onChange={(dueDate) => updateIssue(issue.id, { dueDate })}
                  />
               </div>
            </div>
         </Section>

         <Section title="Labels">
            <div className="flex items-center flex-wrap gap-1.5">
               <LabelBadge label={issue.labels} />
               <LabelSelector selectedLabels={issue.labels} onChange={onLabelsChange} />
            </div>
         </Section>

         {issue.project && (
            <Section title="Project">
               <div className="flex items-center gap-2 text-sm">
                  <issue.project.icon className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{issue.project.name}</span>
               </div>
               {(detail.milestone || onChanged) && (
                  <div className="flex items-center gap-2 text-sm mt-1.5 pl-6">
                     <span className="size-2 rotate-45 border border-amber-400 shrink-0" />
                     {editingMs ? (
                        <input
                           value={msDraft}
                           onChange={(e) => setMsDraft(e.target.value)}
                           autoFocus
                           placeholder="Milestone"
                           onBlur={() => void saveMilestone()}
                           onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveMilestone();
                              if (e.key === 'Escape') setEditingMs(false);
                           }}
                           className="flex-1 bg-transparent text-sm outline-none border rounded px-1.5 h-6"
                        />
                     ) : (
                        <button
                           type="button"
                           disabled={!onChanged}
                           onClick={() => {
                              setMsDraft(detail.milestone ?? '');
                              setEditingMs(true);
                           }}
                           className={cn(
                              'truncate text-left',
                              detail.milestone
                                 ? 'text-muted-foreground'
                                 : 'text-muted-foreground/60',
                              onChanged && 'hover:text-foreground transition-colors'
                           )}
                        >
                           {detail.milestone || 'Add milestone'}
                        </button>
                     )}
                  </div>
               )}
            </Section>
         )}

         {onChanged ? (
            <Section title="Blocked by">
               <RelationEditor
                  issueId={issue.id}
                  kind="blocked_by"
                  relatedIds={detail.blockedByIds ?? []}
                  addLabel="Add blocking issue"
                  onChanged={onChanged}
               />
            </Section>
         ) : (
            detail.blockedByIds &&
            detail.blockedByIds.length > 0 && (
               <Section title="Blocked by">
                  <div className="flex flex-col">
                     {detail.blockedByIds.map((identifier) => (
                        <div key={identifier} className="flex items-center gap-1.5 min-w-0">
                           <Ban className="size-3.5 text-red-500 shrink-0" />
                           <IssueRefRow identifier={identifier} />
                        </div>
                     ))}
                  </div>
               </Section>
            )
         )}

         {/* Blocking (lado inverso, derivado de blocked_by) — read-only, paridade Linear "Blocks" */}
         {detail.blockingIds && detail.blockingIds.length > 0 && (
            <Section title="Blocking">
               <div className="flex flex-col">
                  {detail.blockingIds.map((identifier) => (
                     <div key={identifier} className="flex items-center gap-1.5 min-w-0">
                        <Ban className="size-3.5 text-orange-500 shrink-0" />
                        <IssueRefRow identifier={identifier} />
                     </div>
                  ))}
               </div>
            </Section>
         )}

         {onChanged ? (
            <Section title="Related">
               <RelationEditor
                  issueId={issue.id}
                  kind="related"
                  relatedIds={detail.relatedIds ?? []}
                  addLabel="Add related issue"
                  onChanged={onChanged}
               />
            </Section>
         ) : (
            detail.relatedIds &&
            detail.relatedIds.length > 0 && (
               <Section title="Related">
                  <div className="flex flex-col">
                     {detail.relatedIds.map((identifier) => (
                        <IssueRefRow key={identifier} identifier={identifier} />
                     ))}
                  </div>
               </Section>
            )
         )}

         {onChanged ? (
            <Section title="Duplicate of">
               <RelationEditor
                  issueId={issue.id}
                  kind="duplicate"
                  relatedIds={detail.duplicateIds ?? []}
                  addLabel="Mark as duplicate of"
                  onChanged={onChanged}
               />
            </Section>
         ) : (
            detail.duplicateIds &&
            detail.duplicateIds.length > 0 && (
               <Section title="Duplicate of">
                  <div className="flex flex-col">
                     {detail.duplicateIds.map((identifier) => (
                        <IssueRefRow key={identifier} identifier={identifier} />
                     ))}
                  </div>
               </Section>
            )
         )}

         {detail.prLinks && detail.prLinks.length > 0 && (
            <Section title="Diffs">
               <div className="flex flex-col gap-1">
                  {detail.prLinks.map((pr) => (
                     <div key={pr.id} className="flex items-center gap-2 text-sm min-w-0">
                        <GitPullRequestArrow
                           className={
                              'size-3.5 shrink-0 ' +
                              (pr.status === 'merged' ? 'text-purple-400' : 'text-green-500')
                           }
                        />
                        <span className="text-muted-foreground shrink-0">{pr.id}</span>
                        <span className="truncate">{pr.title}</span>
                        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                           {pr.status}
                        </span>
                     </div>
                  ))}
               </div>
            </Section>
         )}
      </div>
   );
}
