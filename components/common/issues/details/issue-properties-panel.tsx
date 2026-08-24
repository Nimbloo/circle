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
import { Ban, CheckIcon, GitPullRequestArrow } from 'lucide-react';
import { useState } from 'react';
import { LabelBadge } from '../label-badge';
import { PrioritySelector } from '../priority-selector';
import { StatusSelector } from '../status-selector';
import { AssigneeSelector } from '@/components/layout/sidebar/create-new-issue/assignee-selector';
import { LabelSelector } from '@/components/layout/sidebar/create-new-issue/label-selector';
import { EstimateSelector } from '@/components/layout/sidebar/create-new-issue/estimate-selector';
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
                     onChange={(estimate) => updateIssue(issue.id, { estimate })}
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
               {detail.milestone && (
                  <div className="flex items-center gap-2 text-sm mt-1.5 pl-6 text-muted-foreground">
                     <span className="size-2 rotate-45 border border-amber-400 shrink-0" />
                     <span className="truncate">{detail.milestone}</span>
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

         {/* "Blocking" é o reverso de blocked_by (read-only aqui — pra remover, edita o
             blocked_by da outra issue). Antes a contraparte não via nada. */}
         {detail.blockingIds && detail.blockingIds.length > 0 && (
            <Section title="Blocking">
               <div className="flex flex-col">
                  {detail.blockingIds.map((id) => (
                     <div key={id} className="flex items-center gap-1.5 min-w-0">
                        <Ban className="size-3.5 text-amber-500 shrink-0" />
                        <IssueRefRow identifier={id} />
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
