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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useIssuesStore } from '@/store/issues-store';
import { useStatuses, usePriorities } from '@/store/catalog-store';
import { renderStatusIcon } from '@/lib/status-utils';
import { IssueDetail } from '@/data/issue-details';
import { Issue } from '@/data/issues';
import { LabelInterface } from '@/data/labels';
import { Ban, CheckIcon, Folder, Gauge, GitPullRequestArrow, UserCircle } from 'lucide-react';
import { useState } from 'react';
import { LabelBadge } from '../label-badge';
import { LabelSelector } from '@/components/layout/sidebar/create-new-issue/label-selector';
import { ESTIMATE_SCALE } from '@/components/layout/sidebar/create-new-issue/estimate-selector';
import { IssueRefRow } from './content-blocks';
import { RelationEditor } from './relation-editor';

/**
 * Estilo Linear das rows de property (inbox detail): row full-width compacta,
 * ícone 16 + label, hover sutil, placeholder muted / valor branco, click abre
 * o picker. Mesma altura/tipografia medidas no Linear (h-7, 13px).
 */
const PROP_ROW =
   'w-full h-7 justify-start gap-2 px-1.5 -mx-1.5 rounded-md text-[13px] font-medium hover:bg-accent/60 data-[state=open]:bg-accent/60';

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
            <Button variant="ghost" size="sm" className={PROP_ROW}>
               <CyclePlayIcon className="size-4" />
               <span className={current ? '' : 'text-muted-foreground'}>
                  {current ? current.name : 'Add to cycle'}
               </span>
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

/** Status: row Linear (ícone do status + nome), click abre picker searchable. */
function StatusRow({ issue }: { issue: Issue }) {
   const [open, setOpen] = useState(false);
   const statuses = useStatuses();
   const update = useIssuesStore((s) => s.updateIssueStatus);
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={PROP_ROW}>
               {renderStatusIcon(issue.status.id)}
               <span>{issue.status.name}</span>
            </Button>
         </PopoverTrigger>
         <PopoverContent className="border-input w-56 p-0" align="start">
            <Command>
               <CommandInput placeholder="Set status..." />
               <CommandList>
                  <CommandEmpty>No status found.</CommandEmpty>
                  <CommandGroup>
                     {statuses.map((s) => (
                        <CommandItem
                           key={s.id}
                           value={s.name}
                           onSelect={() => {
                              update(issue.id, s);
                              setOpen(false);
                           }}
                        >
                           <s.icon />
                           <span>{s.name}</span>
                           {issue.status.id === s.id && (
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

/** Priority: row Linear com placeholder "Set priority" quando ausente. */
function PriorityRow({ issue }: { issue: Issue }) {
   const [open, setOpen] = useState(false);
   const priorities = usePriorities();
   const update = useIssuesStore((s) => s.updateIssuePriority);
   const isNone = issue.priority.id === 'no-priority' || /no.?priority/i.test(issue.priority.name);
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={PROP_ROW}>
               <issue.priority.icon className="size-4 text-muted-foreground" />
               <span className={isNone ? 'text-muted-foreground' : ''}>
                  {isNone ? 'Set priority' : issue.priority.name}
               </span>
            </Button>
         </PopoverTrigger>
         <PopoverContent className="border-input w-56 p-0" align="start">
            <Command>
               <CommandInput placeholder="Set priority..." />
               <CommandList>
                  <CommandEmpty>No priority found.</CommandEmpty>
                  <CommandGroup>
                     {priorities.map((p) => (
                        <CommandItem
                           key={p.id}
                           value={p.name}
                           onSelect={() => {
                              update(issue.id, p);
                              setOpen(false);
                           }}
                        >
                           <p.icon className="size-4" />
                           <span>{p.name}</span>
                           {issue.priority.id === p.id && (
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

/** Assignee: row Linear com avatar/placeholder "Assign". */
function AssigneeRow({ issue }: { issue: Issue }) {
   const [open, setOpen] = useState(false);
   const users = useWorkspaceStore((s) => s.users);
   const update = useIssuesStore((s) => s.updateIssueAssignee);
   const a = issue.assignee;
   const pick = (u: (typeof users)[number] | null) => {
      update(issue.id, u);
      setOpen(false);
   };
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={PROP_ROW}>
               {a ? (
                  <Avatar className="size-4">
                     <AvatarImage src={a.avatarUrl || undefined} alt={a.name} />
                     <AvatarFallback className="text-[9px]">{a.name[0]}</AvatarFallback>
                  </Avatar>
               ) : (
                  <UserCircle className="size-4 text-muted-foreground" />
               )}
               <span className={a ? '' : 'text-muted-foreground'}>{a ? a.name : 'Assign'}</span>
            </Button>
         </PopoverTrigger>
         <PopoverContent className="border-input w-56 p-0" align="start">
            <Command>
               <CommandInput placeholder="Assign to..." />
               <CommandList>
                  <CommandEmpty>No members found.</CommandEmpty>
                  {/* Distinção estilo Linear: quem JÁ está assigned no topo; abaixo, os
                      membros do Circle que PODEM ser atribuídos (sem convite externo). */}
                  {a && (
                     <CommandGroup heading="Assigned">
                        <CommandItem value={`assigned ${a.name}`} onSelect={() => pick(a)}>
                           <Avatar className="size-4">
                              <AvatarImage src={a.avatarUrl || undefined} alt={a.name} />
                              <AvatarFallback className="text-[9px]">{a.name[0]}</AvatarFallback>
                           </Avatar>
                           <span>{a.name}</span>
                           <CheckIcon size={16} className="ml-auto" />
                        </CommandItem>
                     </CommandGroup>
                  )}
                  <CommandGroup heading="Members">
                     <CommandItem value="unassigned" onSelect={() => pick(null)}>
                        <UserCircle className="size-4" />
                        <span>Unassigned</span>
                        {!a && <CheckIcon size={16} className="ml-auto" />}
                     </CommandItem>
                     {users
                        .filter((u) => u.id !== a?.id)
                        .map((u) => (
                           <CommandItem key={u.id} value={u.name} onSelect={() => pick(u)}>
                              <Avatar className="size-4">
                                 <AvatarImage src={u.avatarUrl || undefined} alt={u.name} />
                                 <AvatarFallback className="text-[9px]">
                                    {u.name[0]}
                                 </AvatarFallback>
                              </Avatar>
                              <span>{u.name}</span>
                           </CommandItem>
                        ))}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

/** Project: row Linear com placeholder "Add to project". */
function ProjectRow({ issue }: { issue: Issue }) {
   const [open, setOpen] = useState(false);
   const projects = useWorkspaceStore((s) => s.projects);
   const update = useIssuesStore((s) => s.updateIssueProject);
   const p = issue.project;
   const pick = (proj: (typeof projects)[number] | undefined) => {
      update(issue.id, proj);
      setOpen(false);
   };
   const Icon = p?.icon ?? Folder;
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={PROP_ROW}>
               <Icon className="size-4 text-muted-foreground" />
               <span className={p ? '' : 'text-muted-foreground'}>
                  {p ? p.name : 'Add to project'}
               </span>
            </Button>
         </PopoverTrigger>
         <PopoverContent className="border-input w-64 p-0" align="start">
            <Command>
               <CommandInput placeholder="Add to project..." />
               <CommandList>
                  <CommandEmpty>No projects found.</CommandEmpty>
                  <CommandGroup>
                     <CommandItem value="no-project" onSelect={() => pick(undefined)}>
                        <Folder className="size-4" />
                        <span>No project</span>
                        {!p && <CheckIcon size={16} className="ml-auto" />}
                     </CommandItem>
                     {projects.map((proj) => (
                        <CommandItem key={proj.id} value={proj.name} onSelect={() => pick(proj)}>
                           <proj.icon className="size-4" />
                           <span className="truncate">{proj.name}</span>
                           {p?.id === proj.id && <CheckIcon size={16} className="ml-auto" />}
                        </CommandItem>
                     ))}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

/** Estimate: row Linear com placeholder "Add estimate". */
function EstimateRow({ issue }: { issue: Issue }) {
   const [open, setOpen] = useState(false);
   const update = useIssuesStore((s) => s.updateIssue);
   const e = issue.estimate;
   const pick = (val: number | undefined) => {
      update(issue.id, { estimate: val });
      setOpen(false);
   };
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={PROP_ROW}>
               <Gauge className="size-4 text-muted-foreground" />
               <span className={e === undefined ? 'text-muted-foreground' : ''}>
                  {e === undefined ? 'Add estimate' : `${e} ${e === 1 ? 'point' : 'points'}`}
               </span>
            </Button>
         </PopoverTrigger>
         <PopoverContent className="border-input w-56 p-0" align="start">
            <Command>
               <CommandList>
                  <CommandGroup>
                     <CommandItem value="none" onSelect={() => pick(undefined)}>
                        <Gauge className="size-4 text-muted-foreground" />
                        <span>No estimate</span>
                        {e === undefined && <CheckIcon size={16} className="ml-auto" />}
                     </CommandItem>
                     {ESTIMATE_SCALE.map((pts) => (
                        <CommandItem key={pts} value={String(pts)} onSelect={() => pick(pts)}>
                           <Gauge className="size-4 text-muted-foreground" />
                           <span>
                              {pts} {pts === 1 ? 'point' : 'points'}
                           </span>
                           {e === pts && <CheckIcon size={16} className="ml-auto" />}
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
         <h3 className="text-[13px] font-medium text-muted-foreground mb-2">{title}</h3>
         {children}
      </div>
   );
}

/**
 * Right sidebar of the issue page: editable properties (status, priority,
 * assignee), cycle, labels, project + milestone, relations and linked PRs.
 */
export function IssuePropertiesPanel({ issue, detail, onChanged }: IssuePropertiesPanelProps) {
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
            <div className="flex flex-col gap-0.5">
               <StatusRow issue={issue} />
               <PriorityRow issue={issue} />
               <AssigneeRow issue={issue} />
               <CycleSelector issue={issue} />
               <ProjectRow issue={issue} />
               <EstimateRow issue={issue} />
            </div>
         </Section>

         <Section title="Labels">
            <div className="flex items-center flex-wrap gap-1.5">
               <LabelBadge label={issue.labels} />
               <LabelSelector selectedLabels={issue.labels} onChange={onLabelsChange} />
            </div>
         </Section>

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
