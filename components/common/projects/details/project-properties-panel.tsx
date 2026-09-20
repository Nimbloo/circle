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
import { bucketIssues } from '@/lib/issue-breakdown';
import { format, parseISO } from 'date-fns';
import { ProjectProgressChart } from './project-progress-chart';
import { ProjectDependenciesPicker } from './project-dependencies-picker';
import { ProgressHistory } from '../progress-history';
import { PROGRESS_COLORS } from '../progress-colors';
import { PropertyRow, ProjectPropertyRows } from '../project-property-fields';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
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
   keyOf: (issue: Issue) => T | readonly T[] | undefined,
   describe: (key: T, sample: Issue) => Omit<BreakdownRow, 'total' | 'completedPercent'>
): BreakdownRow[] {
   return [...bucketIssues(issues, keyOf).entries()]
      .map(([key, bucket]) => ({
         ...describe(key, bucket[0]),
         total: bucket.length,
         completedPercent: Math.round((bucket.filter(isCompleted).length / bucket.length) * 100),
      }))
      .sort((a, b) => b.total - a.total);
}

/**
 * Fora da aba Issues o filtro do painel não tem lista para filtrar (pl#7): o clique
 * abre a aba Issues do projeto já com o filtro na URL (`?filters=`, o mesmo formato
 * do filter-store), em vez de não fazer nada.
 */
function filterHref(orgId: string, projectId: string, target: PanelFilterTarget): string {
   const filters = [
      {
         columnId: target.columnId,
         type: target.columnId === 'labels' ? 'multiOption' : 'option',
         operator: target.columnId === 'labels' ? 'include' : 'is',
         values: [target.value],
      },
   ];
   return `/${orgId}/project/${projectId}/issues?filters=${encodeURIComponent(
      JSON.stringify(filters)
   )}`;
}

function BreakdownList({
   rows,
   panelFilter,
   onNavigate,
}: {
   rows: BreakdownRow[];
   panelFilter: ReturnType<typeof usePanelFilter>;
   /** Ausente na aba Issues: ali o clique filtra a lista que já está na tela. */
   onNavigate?: (target: PanelFilterTarget) => void;
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
                  onClick={() => {
                     if (!row.target) return;
                     if (onNavigate) onNavigate(row.target);
                     else panelFilter.toggle(row.target);
                  }}
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
                     <CapacityRing value={row.completedPercent} color={PROGRESS_COLORS.completed} />
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
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const pathname = usePathname();
   // Na aba Issues o filtro age na lista da tela; fora dela, navega para a aba (pl#7).
   const navigate =
      projectId && !pathname.endsWith('/issues')
         ? (target: PanelFilterTarget) => router.push(filterHref(orgId, projectId, target))
         : undefined;
   const completed = issues.filter(isCompleted).length;

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
            (issue) => issue.labels.map((label) => label.id),
            (key, sample) => {
               const label = sample.labels.find((candidate) => candidate.id === key);
               return {
                  key: String(key),
                  label: label?.name ?? 'Unlabeled',
                  leading: (
                     <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{
                           backgroundColor: label?.color ?? 'var(--muted-foreground)',
                        }}
                     />
                  ),
                  target: { columnId: 'labels', value: String(key) },
               };
            }
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
      <div className="flex h-full w-full flex-col gap-2 overflow-y-auto">
         {/* Properties */}
         <div className="rounded-[10px] border bg-card p-3">
            <h3 className="mb-1.5 text-[13px] font-medium leading-4">Properties</h3>
            <ProjectPropertyRows
               project={project}
               members={members}
               extra={
                  projectId && (
                     <PropertyRow label="Depends on">
                        <ProjectDependenciesPicker projectId={projectId} />
                     </PropertyRow>
                  )
               }
            />
         </div>

         {/* Milestones */}
         <div className="rounded-[10px] border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
               <h3 className="text-[13px] font-medium leading-4">Milestones</h3>
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
                                    ? 'size-4 rounded-full bg-primary flex items-center justify-center shrink-0'
                                    : 'size-4 rounded-full border border-muted-foreground/40 shrink-0',
                                 canEditMilestones && 'cursor-pointer'
                              )}
                           >
                              {milestone.completed && (
                                 <Check className="size-2.5 text-primary-foreground" />
                              )}
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
                                 className="text-muted-foreground opacity-0 transition-opacity group-hover/ms:opacity-100 hover:text-destructive"
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
         {issues.length > 0 && (
            <div className="rounded-[10px] border bg-card p-3">
               <h3 className="mb-3 text-[13px] font-medium leading-4">Progress</h3>
               <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="flex flex-col gap-0.5">
                     <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-2 rounded-[2px] bg-progress-scope" />
                        Scope
                     </div>
                     <span className="text-sm font-medium">{issues.length}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                     <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-2 rounded-[2px] bg-progress-started" />
                        Started
                     </div>
                     <span className="text-sm font-medium">{started}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                     <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-2 rounded-[2px] bg-progress-completed" />
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
               {/* Histórico real por dia (#102) — o snapshot é gravado no boot/GET. */}
               {projectId && (
                  <div className="mb-3">
                     <ProgressHistory projectId={projectId} />
                  </div>
               )}
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
                     <BreakdownList
                        rows={assigneeRows}
                        panelFilter={panelFilter}
                        onNavigate={navigate}
                     />
                  </TabsContent>
                  <TabsContent value="labels">
                     <BreakdownList
                        rows={labelRows}
                        panelFilter={panelFilter}
                        onNavigate={navigate}
                     />
                  </TabsContent>
                  <TabsContent value="cycles">
                     <BreakdownList
                        rows={cycleRows}
                        panelFilter={panelFilter}
                        onNavigate={navigate}
                     />
                  </TabsContent>
               </Tabs>
            </div>
         )}

         {/* Activity */}
         <div className="rounded-[10px] border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
               <h3 className="text-[13px] font-medium leading-4">Activity</h3>
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
