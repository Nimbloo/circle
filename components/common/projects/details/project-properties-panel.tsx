'use client';

import { CapacityRing } from '@/components/common/cycles/capacity-ring';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Issue } from '@/data/issues';
import { ProjectDetail } from '@/data/project-details';
import { Project } from '@/data/projects';
import { useWorkspaceStore } from '@/store/workspace-store';
import { PanelFilterTarget, usePanelFilter } from '@/components/common/issues/use-panel-filter';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ProjectProgressChart } from './project-progress-chart';
import { ArrowRight, Calendar, Check, Compass, Plus, Tag, Trash2, UserPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ProjectPropertiesPanelProps {
   project: Project;
   detail: ProjectDetail;
   issues: Issue[];
   /** Presente => milestones editáveis (add/complete). Ausente => read-only. */
   projectId?: string;
   /** Re-fetch do detalhe após mutação de milestone. */
   onChanged?: () => void | Promise<void>;
}

const isCompleted = (issue: Issue) => issue.status.category === 'completed';

const formatDay = (iso?: string) => (iso ? format(parseISO(iso), 'MMM do') : '—');

interface BreakdownRow {
   key: string;
   label: string;
   leading: React.ReactNode;
   total: number;
   completedPercent: number;
   /** Click-to-filter target (exclusive, like the insights panel rows). */
   target?: PanelFilterTarget;
}

function buildRows<T>(
   issues: Issue[],
   keyOf: (issue: Issue) => T | undefined,
   describe: (key: T, sample: Issue) => Omit<BreakdownRow, 'total' | 'completedPercent'>
): BreakdownRow[] {
   const buckets = new Map<T, Issue[]>();
   for (const issue of issues) {
      const key = keyOf(issue);
      if (key === undefined) continue;
      buckets.set(key, [...(buckets.get(key) ?? []), issue]);
   }
   return [...buckets.entries()]
      .map(([key, bucket]) => ({
         ...describe(key, bucket[0]),
         total: bucket.length,
         completedPercent: Math.round((bucket.filter(isCompleted).length / bucket.length) * 100),
      }))
      .sort((a, b) => b.total - a.total);
}

function BreakdownList({
   rows,
   panelFilter,
}: {
   rows: BreakdownRow[];
   panelFilter: ReturnType<typeof usePanelFilter>;
}) {
   if (rows.length === 0) {
      return <p className="text-xs text-muted-foreground px-1 py-3">Nothing to show yet.</p>;
   }
   return (
      <div className="flex flex-col">
         {rows.map((row) => {
            const active = row.target ? panelFilter.isActive(row.target) : false;
            return (
               <button
                  key={row.key}
                  type="button"
                  onClick={() => row.target && panelFilter.toggle(row.target)}
                  className={cn(
                     'flex items-center justify-between gap-3 py-2 px-1.5 -mx-1.5 rounded-md text-left transition-colors',
                     row.target && 'cursor-pointer hover:bg-accent/50',
                     active && 'bg-accent hover:bg-accent'
                  )}
               >
                  <div className="flex items-center gap-2 min-w-0">
                     {row.leading}
                     <span className="text-sm truncate">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-sm text-muted-foreground">
                     <CapacityRing value={row.completedPercent} color="#6771c5" />
                     <span className="whitespace-nowrap">
                        {row.completedPercent}% of {row.total}
                     </span>
                  </div>
               </button>
            );
         })}
      </div>
   );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
   return (
      <div className="flex items-center justify-between gap-4 min-h-7">
         <span className="text-sm text-muted-foreground shrink-0">{label}</span>
         <div className="flex items-center gap-1.5 text-sm min-w-0">{children}</div>
      </div>
   );
}

/**
 * Right-side panel of the project pages: properties, milestones,
 * progress breakdowns and a compact activity feed.
 */
export function ProjectPropertiesPanel({
   project,
   detail,
   issues,
   projectId,
   onChanged,
}: ProjectPropertiesPanelProps) {
   const panelFilter = usePanelFilter();
   const teams = useWorkspaceStore((s) => s.teams);
   const initiatives = useWorkspaceStore((s) => s.initiatives);
   const completed = issues.filter(isCompleted).length;

   const team = teams.find((candidate) => candidate.id === project.teamId);

   const started = issues.filter((issue) => issue.status.category === 'started').length;

   // Edição de milestones só quando o pai passa projectId + onChanged (overview/activity).
   const canEditMilestones = Boolean(projectId && onChanged);

   const [adding, setAdding] = useState(false);
   const [newName, setNewName] = useState('');
   const [newDate, setNewDate] = useState('');

   const submitMilestone = async () => {
      if (!projectId || !newName.trim()) return;
      try {
         await api.projects.addMilestone(projectId, {
            name: newName.trim(),
            targetDate: newDate || undefined,
         });
         setNewName('');
         setNewDate('');
         setAdding(false);
         await onChanged?.();
         toast.success('Milestone added');
      } catch {
         toast.error('Could not add the milestone');
      }
   };

   const handleDeleteMilestone = async (milestoneId: string) => {
      if (!projectId) return;
      try {
         await api.projects.removeMilestone(projectId, milestoneId);
         await onChanged?.();
      } catch {
         toast.error('Could not delete the milestone');
      }
   };

   const handleToggleMilestone = async (milestoneId: string, completedNow: boolean) => {
      if (!projectId) return;
      try {
         await api.projects.updateMilestone(projectId, milestoneId, { completed: !completedNow });
         await onChanged?.();
      } catch {
         toast.error('Could not update the milestone');
      }
   };

   const members = useMemo(() => {
      const seen = new Set<string>();
      return issues
         .map((issue) => issue.assignee)
         .filter((assignee): assignee is NonNullable<typeof assignee> => {
            if (!assignee || seen.has(assignee.id)) return false;
            seen.add(assignee.id);
            return true;
         });
   }, [issues]);

   const assigneeRows = useMemo(
      () =>
         buildRows(
            issues,
            (issue) => issue.assignee?.id ?? 'no-assignee',
            (key, sample) =>
               sample.assignee
                  ? {
                       key: String(key),
                       label: sample.assignee.name,
                       leading: (
                          <Avatar className="size-5 shrink-0">
                             <AvatarImage
                                src={sample.assignee.avatarUrl || undefined}
                                alt={sample.assignee.name}
                             />
                             <AvatarFallback>{sample.assignee.name[0]}</AvatarFallback>
                          </Avatar>
                       ),
                       target: { columnId: 'assignee', value: sample.assignee.id },
                    }
                  : {
                       key: 'no-assignee',
                       label: 'No assignee',
                       leading: null,
                       target: { columnId: 'assignee', value: 'unassigned' },
                    }
         ),
      [issues]
   );

   const labelRows = useMemo(
      () =>
         buildRows(
            issues,
            (issue) => issue.labels[0]?.id,
            (key, sample) => ({
               key: String(key),
               label: sample.labels[0]?.name ?? 'Unlabeled',
               leading: (
                  <span
                     className="size-2.5 rounded-full shrink-0"
                     style={{ backgroundColor: sample.labels[0]?.color ?? 'gray' }}
                  />
               ),
               target: { columnId: 'labels', value: String(key) },
            })
         ),
      [issues]
   );

   const cycleRows = useMemo(
      () =>
         buildRows(
            issues,
            (issue) => (issue.cycleId === '' ? undefined : issue.cycleId),
            (key) => ({
               key: String(key),
               label:
                  useWorkspaceStore.getState().getCycleById(String(key))?.name ?? `Cycle ${key}`,
               leading: null,
               target: { columnId: 'cycle', value: String(key) },
            })
         ),
      [issues]
   );

   return (
      <div className="flex flex-col h-full w-full overflow-y-auto">
         {/* Properties */}
         <div className="px-5 pt-4 pb-4 border-b">
            <h3 className="text-sm font-medium mb-2.5">Properties</h3>
            <div className="flex flex-col gap-1">
               <PropertyRow label="Status">
                  <project.status.icon />
                  <span>{project.status.name}</span>
               </PropertyRow>
               <PropertyRow label="Priority">
                  <project.priority.icon className="size-3.5 text-muted-foreground" />
                  <span>{project.priority.name}</span>
               </PropertyRow>
               <PropertyRow label="Lead">
                  {project.lead ? (
                     <>
                        <Avatar className="size-5">
                           <AvatarImage
                              src={project.lead.avatarUrl || undefined}
                              alt={project.lead.name}
                           />
                           <AvatarFallback>{project.lead.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="truncate max-w-36">{project.lead.name}</span>
                     </>
                  ) : (
                     <span className="text-muted-foreground">—</span>
                  )}
               </PropertyRow>
               <PropertyRow label="Members">
                  {members.length > 0 ? (
                     <span className="inline-flex items-center gap-1.5">
                        <span className="flex -space-x-1.5">
                           {members.slice(0, 3).map((member) => (
                              <Avatar key={member.id} className="size-5 border-2 border-container">
                                 <AvatarImage
                                    src={member.avatarUrl || undefined}
                                    alt={member.name}
                                 />
                                 <AvatarFallback>{member.name[0]}</AvatarFallback>
                              </Avatar>
                           ))}
                        </span>
                        {members.length} {members.length === 1 ? 'member' : 'members'}
                     </span>
                  ) : (
                     <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <UserPlus className="size-3.5" />
                        No members
                     </span>
                  )}
               </PropertyRow>
               <PropertyRow label="Dates">
                  <span className="inline-flex items-center gap-1">
                     <Calendar className="size-3.5 text-muted-foreground" />
                     {formatDay(project.startDate)}
                  </span>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <span className="inline-flex items-center gap-1">
                     <Calendar className="size-3.5 text-muted-foreground" />
                     {project.targetDate ? formatDay(project.targetDate) : 'Target'}
                  </span>
               </PropertyRow>
               <PropertyRow label="Teams">
                  <span className="inline-flex items-center gap-1.5">
                     {team?.icon} {team?.name ?? project.teamId}
                  </span>
               </PropertyRow>
               <PropertyRow label="Initiatives">
                  {project.initiative ? (
                     <span className="inline-flex items-center gap-1.5 truncate max-w-44">
                        <span>
                           {initiatives.find((i) => i.id === project.initiative)?.icon ?? '🎯'}
                        </span>
                        {initiatives.find((i) => i.id === project.initiative)?.name ??
                           project.initiative}
                     </span>
                  ) : (
                     <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Compass className="size-3.5" />
                        No initiative
                     </span>
                  )}
               </PropertyRow>
               <PropertyRow label="Labels">
                  <div className="flex items-center gap-1.5">
                     {project.labels.length === 0 && (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                           <Tag className="size-3.5" />
                           Add label
                        </span>
                     )}
                     {project.labels.map((label) => (
                        <span
                           key={label.id}
                           className="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5"
                        >
                           <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: label.color }}
                           />
                           {label.name}
                        </span>
                     ))}
                  </div>
               </PropertyRow>
            </div>
         </div>

         {/* Milestones */}
         <div className="px-5 py-4 border-b">
            <div className="flex items-center justify-between mb-2">
               <h3 className="text-sm font-medium">Milestones</h3>
               {canEditMilestones && (
                  <button
                     type="button"
                     onClick={() => setAdding(true)}
                     className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                     <Plus className="size-3.5" />
                  </button>
               )}
            </div>
            {detail.milestones.length === 0 ? (
               <p className="text-xs text-muted-foreground">
                  Add milestones to organize work within your project and break it into more
                  granular stages. <span className="text-foreground/70 underline">Learn more</span>
               </p>
            ) : (
               <div className="flex flex-col gap-1.5">
                  {detail.milestones.map((milestone) => (
                     <div
                        key={milestone.id}
                        className="group/ms flex items-center justify-between gap-2 text-sm"
                     >
                        <span className="flex items-center gap-2 min-w-0">
                           <button
                              type="button"
                              disabled={!canEditMilestones}
                              onClick={() =>
                                 handleToggleMilestone(milestone.id, milestone.completed)
                              }
                              className={cn(
                                 milestone.completed
                                    ? 'size-4 rounded-full bg-violet-500 flex items-center justify-center shrink-0'
                                    : 'size-4 rounded-full border border-muted-foreground/40 shrink-0',
                                 canEditMilestones && 'cursor-pointer'
                              )}
                           >
                              {milestone.completed && <Check className="size-2.5 text-white" />}
                           </button>
                           <span
                              className={
                                 milestone.completed
                                    ? 'truncate line-through text-muted-foreground'
                                    : 'truncate'
                              }
                           >
                              {milestone.name}
                           </span>
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                           <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDay(milestone.targetDate)}
                           </span>
                           {canEditMilestones && (
                              <button
                                 type="button"
                                 onClick={() => handleDeleteMilestone(milestone.id)}
                                 aria-label="Delete milestone"
                                 className="opacity-0 group-hover/ms:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
                              >
                                 <Trash2 className="size-3.5" />
                              </button>
                           )}
                        </span>
                     </div>
                  ))}
               </div>
            )}
            {adding && canEditMilestones && (
               <div className="flex items-center gap-2 mt-2">
                  <input
                     value={newName}
                     onChange={(e) => setNewName(e.target.value)}
                     autoFocus
                     placeholder="Milestone name"
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitMilestone();
                        if (e.key === 'Escape') setAdding(false);
                     }}
                     className="flex-1 bg-transparent text-sm outline-none border rounded-md px-2 h-7"
                  />
                  <input
                     type="date"
                     value={newDate}
                     onChange={(e) => setNewDate(e.target.value)}
                     className="bg-transparent text-xs outline-none border rounded-md px-2 h-7 text-muted-foreground"
                  />
                  <button
                     type="button"
                     onClick={() => setAdding(false)}
                     className="text-muted-foreground hover:text-foreground"
                     aria-label="Cancel"
                  >
                     <X className="size-3.5" />
                  </button>
               </div>
            )}
         </div>

         {/* Progress */}
         <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-medium mb-3">Progress</h3>
            <div className="grid grid-cols-3 gap-2 mb-2">
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#8f9299]" />
                     Scope
                  </div>
                  <span className="text-sm font-medium">{issues.length}</span>
               </div>
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#facc15]" />
                     Started
                  </div>
                  <span className="text-sm font-medium">{started}</span>
               </div>
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#6771c5]" />
                     Completed
                  </div>
                  <span className="text-sm font-medium">{completed}</span>
               </div>
            </div>
            <div className="mb-3">
               <ProjectProgressChart
                  startDate={project.startDate}
                  endDate={project.targetDate ?? project.startDate}
                  scope={issues.length}
                  started={started}
                  completed={completed}
               />
            </div>
            <Tabs defaultValue="assignees">
               <TabsList className="h-8 bg-transparent gap-1 p-0">
                  <TabsTrigger value="assignees" className="text-xs px-2.5 rounded-full">
                     Assignees
                  </TabsTrigger>
                  <TabsTrigger value="labels" className="text-xs px-2.5 rounded-full">
                     Labels
                  </TabsTrigger>
                  <TabsTrigger value="cycles" className="text-xs px-2.5 rounded-full">
                     Cycles
                  </TabsTrigger>
               </TabsList>
               <TabsContent value="assignees">
                  <BreakdownList rows={assigneeRows} panelFilter={panelFilter} />
               </TabsContent>
               <TabsContent value="labels">
                  <BreakdownList rows={labelRows} panelFilter={panelFilter} />
               </TabsContent>
               <TabsContent value="cycles">
                  <BreakdownList rows={cycleRows} panelFilter={panelFilter} />
               </TabsContent>
            </Tabs>
         </div>

         {/* Activity */}
         <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
               <h3 className="text-sm font-medium">Activity</h3>
            </div>
            <div className="flex flex-col gap-3">
               {detail.activity.map((event) => (
                  <div key={event.id} className="flex items-start gap-2 text-xs">
                     <Avatar className="size-4 mt-0.5 shrink-0">
                        <AvatarImage
                           src={event.user.avatarUrl || undefined}
                           alt={event.user.name}
                        />
                        <AvatarFallback>{event.user.name[0]}</AvatarFallback>
                     </Avatar>
                     <p className="text-muted-foreground leading-relaxed">
                        <span className="text-foreground">{event.user.name}</span> {event.text} ·{' '}
                        {formatDay(event.date)}
                     </p>
                  </div>
               ))}
            </div>
         </div>
      </div>
   );
}
