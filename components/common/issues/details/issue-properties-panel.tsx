'use client';

import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIssuesStore } from '@/store/issues-store';
import { IssueDetail } from '@/data/issue-details';
import { Issue } from '@/data/issues';
import { LabelInterface } from '@/data/labels';
import { Ban, CheckIcon, GitPullRequestArrow } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import type { ProjectMilestoneDto } from '@/lib/api/project-detail';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CycleSelector } from '../cycle-selector';
import { LabelBadge } from '../label-badge';
import { PrioritySelector } from '../priority-selector';
import { StatusSelector } from '../status-selector';
import { AssigneeSelector } from '@/components/layout/sidebar/create-new-issue/assignee-selector';
import { LabelSelector } from '@/components/layout/sidebar/create-new-issue/label-selector';
import { EstimateSelector } from '@/components/layout/sidebar/create-new-issue/estimate-selector';
import { DueDateSelector } from '@/components/layout/sidebar/create-new-issue/due-date-selector';
import { ProjectSelector } from '@/components/layout/sidebar/create-new-issue/project-selector';
import { IssueRefRow } from './content-blocks';
import { ParentIssueProperty } from './parent-issue';
import { PropertyRow, PropertyValue, propertyValueClass } from './property-row';
import { RelationEditor } from './relation-editor';
import { DUE_DATE_TONE_CLASS, dueDateLabel, dueDateTone } from '../due-date';
import { AssigneeAvatars } from '../assignee-avatars';
import { labelColor } from '@/components/common/palette';
import { useWorkspaceStore } from '@/store/workspace-store';
import { estimateLabel, normalizeScale } from '@/data/estimate-scales';
import { CalendarClock, Folder, Gauge, Tag, UserCircle } from 'lucide-react';
import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';

/**
 * Atalhos da issue (contrato com a frente C): a tecla dispara o evento de janela
 * CANCELÁVEL e o painel abre o seletor da propriedade — clicando no trigger, que já é o
 * dono do popover — e chama `preventDefault()` para a palette não abrir junto.
 */
export const ISSUE_SHORTCUT_EVENT = 'circle:issue-shortcut';
export type IssueShortcutAction =
   | 'status'
   | 'priority'
   | 'assignee'
   | 'labels'
   | 'project'
   | 'cycle'
   | 'estimate'
   | 'dueDate';

interface IssuePropertiesPanelProps {
   issue: Issue;
   detail: IssueDetail;
   /** Quando fornecido, as relações (related/blocked-by) ficam editáveis e o pai refetch. */
   onChanged?: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
   return (
      <div>
         <h3 className="mb-2 h-5 px-2 text-[13px] font-medium leading-5 text-muted-foreground">
            {title}
         </h3>
         {children}
      </div>
   );
}

/**
 * Selector de milestone do projeto da issue. Lista as milestones reais do
 * projeto (FK issue.milestoneId → project_milestone) + "No milestone".
 */
function MilestoneSelector({
   issueId,
   projectId,
   currentId,
   currentName,
   onChanged,
}: {
   issueId: string;
   projectId: string;
   currentId: string | null;
   currentName: string | null;
   onChanged?: () => Promise<void> | void;
}) {
   const [open, setOpen] = useState(false);
   const [milestones, setMilestones] = useState<ProjectMilestoneDto[] | null>(null);

   // Invalida o cache quando o projeto da issue muda — senão a lista fica a do projeto
   // anterior (nunca refetcha) e nenhum item casa o currentId.
   useEffect(() => {
      setMilestones(null);
   }, [projectId]);

   const load = async () => {
      if (milestones) return;
      try {
         setMilestones(await api.projects.milestones(projectId));
      } catch {
         setMilestones([]);
      }
   };

   const select = async (milestoneId: string | null) => {
      setOpen(false);
      if (milestoneId === currentId) return;
      try {
         await api.issues.update(issueId, { milestoneId });
         await onChanged?.();
      } catch {
         toast.error('Could not update the milestone');
      }
   };

   return (
      <Popover
         open={open}
         onOpenChange={(o) => {
            setOpen(o);
            if (o) void load();
         }}
      >
         <PopoverTrigger asChild>
            <button
               type="button"
               aria-label="Set milestone"
               className={cn(propertyValueClass, !currentName && 'text-muted-foreground')}
            >
               <span className="size-2 shrink-0 rotate-45 border border-amber-400" />
               <span className="truncate">{currentName || 'Add milestone'}</span>
            </button>
         </PopoverTrigger>
         <PopoverContent className="border-input w-64 p-0" align="start">
            <Command>
               <CommandInput placeholder="Set milestone..." />
               <CommandList>
                  <CommandEmpty>No milestones</CommandEmpty>
                  <CommandGroup>
                     <CommandItem value="__none__" onSelect={() => void select(null)}>
                        <span className="flex-1">No milestone</span>
                        {currentId === null && <CheckIcon className="size-4" />}
                     </CommandItem>
                     {milestones?.map((m) => (
                        <CommandItem key={m.id} value={m.name} onSelect={() => void select(m.id)}>
                           <span className="size-2 rotate-45 border border-amber-400 shrink-0 mr-1" />
                           <span className="flex-1 truncate">{m.name}</span>
                           {currentId === m.id && <CheckIcon className="size-4" />}
                        </CommandItem>
                     ))}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

/**
 * Right sidebar of the issue page: editable properties (status, priority,
 * assignee), cycle, labels, project + milestone, relations and linked PRs.
 */
export function IssuePropertiesPanel({ issue, detail, onChanged }: IssuePropertiesPanelProps) {
   const updateIssue = useIssuesStore((s) => s.updateIssue);
   const updateIssueAssignees = useIssuesStore((s) => s.updateIssueAssignees);
   const addIssueLabel = useIssuesStore((s) => s.addIssueLabel);
   const removeIssueLabel = useIssuesStore((s) => s.removeIssueLabel);
   // O store reverte + avisa o erro e re-lança; aqui só não deixa a rejeição solta (Is#13).
   const settle = (p: Promise<unknown>) => void p.catch(() => undefined);
   const updateIssueProject = useIssuesStore((s) => s.updateIssueProject);
   const projects = useWorkspaceStore((s) => s.projects);
   const team = useWorkspaceStore((s) => (issue.teamId ? s.getTeamById(issue.teamId) : undefined));
   const cycle = useWorkspaceStore((s) =>
      issue.cycleId ? s.cycles.find((c) => c.id === issue.cycleId) : undefined
   );
   const scale = normalizeScale(team?.estimateScale);

   // Um ref por propriedade: o evento de atalho clica no trigger correspondente.
   const triggers = useRef<Partial<Record<IssueShortcutAction, HTMLButtonElement | null>>>({});
   const setTrigger = (action: IssueShortcutAction) => (el: HTMLButtonElement | null) => {
      triggers.current[action] = el;
   };
   useEffect(() => {
      const onShortcut = (e: Event) => {
         const action = (e as CustomEvent<{ action?: IssueShortcutAction }>).detail?.action;
         const trigger = action ? triggers.current[action] : null;
         if (!trigger) return;
         // Contrato com a frente C: o evento é cancelável e quem abre o seletor avisa
         // com `preventDefault()` — senão a palette abre a sub-página por cima.
         e.preventDefault();
         trigger.click();
      };
      window.addEventListener(ISSUE_SHORTCUT_EVENT, onShortcut);
      return () => window.removeEventListener(ISSUE_SHORTCUT_EVENT, onShortcut);
   }, []);

   // Diff entre a seleção do LabelSelector e as labels atuais → add/remove no store.
   const onLabelsChange = (next: LabelInterface[]) => {
      next
         .filter((l) => !issue.labels.some((c) => c.id === l.id))
         .forEach((l) => settle(addIssueLabel(issue.id, l)));
      issue.labels
         .filter((c) => !next.some((l) => l.id === c.id))
         .forEach((c) => settle(removeIssueLabel(issue.id, c.id)));
   };

   return (
      <div className="flex flex-col gap-7 pl-1">
         {/* is#13: uma linha por propriedade, todas no mesmo padrão (rótulo de 96 px +
             valor como botão fantasma); vazio vira "Add X" em vez de sumir. */}
         <Section title="Properties">
            <div className="flex flex-col">
               <PropertyRow label="Status">
                  <StatusSelector status={issue.status} issueId={issue.id}>
                     <PropertyValue
                        ref={setTrigger('status')}
                        placeholder="Add status"
                        icon={<issue.status.icon />}
                        aria-label="Set status"
                     >
                        {issue.status.name}
                     </PropertyValue>
                  </StatusSelector>
               </PropertyRow>

               <PropertyRow label="Priority">
                  <PrioritySelector priority={issue.priority} issueId={issue.id}>
                     <PropertyValue
                        ref={setTrigger('priority')}
                        placeholder="Add priority"
                        icon={<issue.priority.icon className="size-4 text-muted-foreground" />}
                        aria-label={`Change priority: ${issue.priority.name}`}
                     >
                        {issue.priority.name}
                     </PropertyValue>
                  </PrioritySelector>
               </PropertyRow>

               <PropertyRow label="Assignee">
                  <AssigneeSelector
                     assignees={issue.assignees}
                     onChange={(assignees) => settle(updateIssueAssignees(issue.id, assignees))}
                  >
                     <PropertyValue
                        ref={setTrigger('assignee')}
                        empty={issue.assignees.length === 0}
                        placeholder="Add assignee"
                        icon={
                           issue.assignees.length ? (
                              <AssigneeAvatars users={issue.assignees} size="sm" />
                           ) : (
                              <UserCircle className="size-4 text-muted-foreground" />
                           )
                        }
                        aria-label="Assign issue"
                     >
                        {issue.assignees.length === 1
                           ? issue.assignees[0].name
                           : `${issue.assignees[0]?.name} +${issue.assignees.length - 1}`}
                     </PropertyValue>
                  </AssigneeSelector>
               </PropertyRow>

               {/* is#12: Project sempre presente e editável (antes era texto, só quando havia). */}
               <PropertyRow label="Project">
                  <ProjectSelector
                     project={issue.project}
                     teamId={issue.teamId}
                     onChange={(project) => settle(updateIssueProject(issue.id, project))}
                  >
                     <PropertyValue
                        ref={setTrigger('project')}
                        empty={!issue.project}
                        placeholder="Add project"
                        icon={
                           issue.project ? (
                              <issue.project.icon className="size-4 shrink-0 text-muted-foreground" />
                           ) : (
                              <Folder className="size-4 text-muted-foreground" />
                           )
                        }
                        aria-label="Set project"
                     >
                        {issue.project?.name}
                     </PropertyValue>
                  </ProjectSelector>
               </PropertyRow>

               {issue.project && (
                  <PropertyRow label="Milestone">
                     {onChanged ? (
                        <MilestoneSelector
                           issueId={issue.id}
                           projectId={issue.project.id}
                           currentId={detail.milestoneId ?? null}
                           currentName={detail.milestoneName ?? detail.milestone ?? null}
                           onChanged={onChanged}
                        />
                     ) : (
                        <span className="px-1.5 text-muted-foreground">
                           {detail.milestoneName || detail.milestone || 'No milestone'}
                        </span>
                     )}
                  </PropertyRow>
               )}

               <PropertyRow label="Cycle">
                  <CycleSelector issue={issue}>
                     <PropertyValue
                        ref={setTrigger('cycle')}
                        empty={!cycle}
                        placeholder="Add to cycle"
                        icon={<CyclePlayIcon className="size-4 text-muted-foreground" />}
                        aria-label="Set cycle"
                     >
                        {cycle?.name}
                     </PropertyValue>
                  </CycleSelector>
               </PropertyRow>

               <PropertyRow label="Estimate">
                  <EstimateSelector
                     estimate={issue.estimate}
                     teamId={issue.teamId}
                     onChange={(estimate) => settle(updateIssue(issue.id, { estimate }))}
                  >
                     <PropertyValue
                        ref={setTrigger('estimate')}
                        empty={issue.estimate === undefined}
                        placeholder="Add estimate"
                        icon={<Gauge className="size-4 text-muted-foreground" />}
                        aria-label="Set estimate"
                     >
                        {issue.estimate !== undefined && estimateLabel(issue.estimate, scale)}
                     </PropertyValue>
                  </EstimateSelector>
               </PropertyRow>

               <PropertyRow label="Labels">
                  <LabelSelector selectedLabels={issue.labels} onChange={onLabelsChange}>
                     <PropertyValue
                        ref={setTrigger('labels')}
                        empty={issue.labels.length === 0}
                        placeholder="Add label"
                        icon={
                           issue.labels.length ? (
                              <span className="flex -space-x-1">
                                 {issue.labels.slice(0, 3).map((l) => (
                                    <span
                                       key={l.id}
                                       className="size-2.5 rounded-full ring-1 ring-background"
                                       style={{ backgroundColor: labelColor(l.color) }}
                                    />
                                 ))}
                              </span>
                           ) : (
                              <Tag className="size-4 text-muted-foreground" />
                           )
                        }
                        aria-label="Set labels"
                     >
                        {issue.labels.length === 1
                           ? issue.labels[0].name
                           : `${issue.labels.length} labels`}
                     </PropertyValue>
                  </LabelSelector>
               </PropertyRow>

               <PropertyRow label="Due date">
                  <DueDateSelector
                     dueDate={issue.dueDate}
                     onChange={(dueDate) => settle(updateIssue(issue.id, { dueDate }))}
                  >
                     <PropertyValue
                        ref={setTrigger('dueDate')}
                        empty={!issue.dueDate}
                        placeholder="Add due date"
                        icon={<CalendarClock className="size-4 text-muted-foreground" />}
                        className={
                           issue.dueDate
                              ? DUE_DATE_TONE_CLASS[dueDateTone(issue.dueDate)]
                              : undefined
                        }
                        aria-label="Change due date"
                     >
                        {issue.dueDate && dueDateLabel(issue.dueDate)}
                     </PropertyValue>
                  </DueDateSelector>
               </PropertyRow>
            </div>
         </Section>

         {(onChanged || detail.parent) && (
            <Section title="Parent">
               {onChanged ? (
                  <ParentIssueProperty
                     issue={issue}
                     parent={detail.parent ?? null}
                     onChanged={onChanged}
                  />
               ) : (
                  detail.parent && <IssueRefRow identifier={detail.parent.identifier} />
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
                           <Ban className="size-3.5 shrink-0 text-destructive" />
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
                        <Ban className="size-3.5 shrink-0 text-chart-5" />
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
                           className="size-3.5 shrink-0"
                           style={{
                              color:
                                 pr.status === 'merged'
                                    ? 'var(--review-merged)'
                                    : 'var(--review-open)',
                           }}
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
