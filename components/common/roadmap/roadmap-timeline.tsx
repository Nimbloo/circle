'use client';

import { CapacityRing } from '@/components/common/cycles/capacity-ring';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Project } from '@/data/projects';
import type { RoadmapDependency, RoadmapMilestone } from '@/lib/client';
import { isValidProjectDate, projectDateRangeLabel } from '@/lib/project-dates';
import {
   type DateRange,
   type RescheduleMode,
   daysFromPixels,
   keyboardRescheduleDelta,
   rescheduleRange,
   sameRange,
} from '@/lib/timeline-reschedule';
import {
   BIWEEKLY_DATES,
   LIST_WIDTH,
   MONTHS,
   type TimelineZoom,
   WEEKLY_DATES,
   dayWidthOf,
   monthWidthOf,
   offsetFor,
   offsetForTime,
   totalWidthOf,
} from '@/lib/timeline-scale';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Compass } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Grupo já resolvido para a tela: a initiative (ou "No initiative") e seus projetos. */
export interface RoadmapRenderGroup {
   id: string;
   name: string;
   icon: string | null;
   depth: number;
   percentComplete: number;
   projectCount: number;
   completedProjectCount: number;
   projects: Project[];
}

interface RoadmapTimelineProps {
   groups: RoadmapRenderGroup[];
   milestones: RoadmapMilestone[];
   dependencies: RoadmapDependency[];
   zoom: TimelineZoom;
   showDependencies: boolean;
   showMilestones: boolean;
   showProjectList: boolean;
}

/** Altura de uma linha de projeto e do cabeçalho de initiative (px). */
const ROW_HEIGHT = 56;
const GROUP_HEADER_HEIGHT = 36;
/** Topo/altura da barra dentro da linha. */
const BAR_TOP = 14;
const BAR_HEIGHT = 28;
const MIN_BAR_WIDTH = 130;

/** Instrução de teclado para leitores de tela (aria-describedby das barras). */
const RESCHEDULE_HINT_ID = 'roadmap-reschedule-hint';

interface BarBounds {
   left: number;
   width: number;
}

function boundsOf(project: Project, monthWidth: number): BarBounds | null {
   if (!isValidProjectDate(project.startDate)) return null;
   const left = offsetFor(project.startDate, monthWidth);
   const right = offsetFor(
      isValidProjectDate(project.targetDate) ? project.targetDate! : project.startDate,
      monthWidth
   );
   return { left, width: Math.max(right - left, MIN_BAR_WIDTH) };
}

interface ActiveDrag {
   mode: RescheduleMode;
   pointerId: number;
   startX: number;
   /** Só vira `true` após o primeiro snap (evita tratar um clique como arraste). */
   moved: boolean;
}

/**
 * Barra de um projeto no Roadmap: arrastável quando tem as duas datas (o corpo move
 * as duas, as alças mexem numa ponta só; ←/→ movem 1 dia, Shift 7). Carrega os marcos
 * como losangos e o alerta de dependência atrasada.
 */
function RoadmapBar({
   project,
   monthWidth,
   milestones,
   blockedBy,
   showMilestones,
   onReschedule,
}: {
   project: Project;
   monthWidth: number;
   milestones: RoadmapMilestone[];
   /** Dependências atrasadas que travam este projeto (nome + motivo). */
   blockedBy: { name: string; reason: 'overlap' | 'overdue' | null }[];
   showMilestones: boolean;
   onReschedule: (project: Project, next: DateRange) => void;
}) {
   const reschedulable = isValidProjectDate(project.targetDate);
   const base: DateRange = {
      startDate: project.startDate,
      targetDate: isValidProjectDate(project.targetDate) ? project.targetDate! : project.startDate,
   };
   const [draft, setDraftState] = useState<DateRange | null>(null);
   /** Espelho do `draft` lido no pointerup (o estado pode não ter re-renderizado ainda). */
   const draftRef = useRef<DateRange | null>(null);
   const setDraft = (next: DateRange | null) => {
      draftRef.current = next;
      setDraftState(next);
   };
   const dragRef = useRef<ActiveDrag | null>(null);
   const wrapperRef = useRef<HTMLDivElement>(null);

   const range = draft ?? base;
   const left = offsetFor(range.startDate, monthWidth);
   const right = offsetFor(range.targetDate, monthWidth);
   const width = Math.max(right - left, MIN_BAR_WIDTH);
   const dayWidth = dayWidthOf(monthWidth);
   const rangeLabel = projectDateRangeLabel(range.startDate, range.targetDate) ?? range.startDate;

   const beginDrag = (mode: RescheduleMode) => (event: React.PointerEvent) => {
      if (!reschedulable || event.button !== 0) return;
      event.stopPropagation();
      dragRef.current = { mode, pointerId: event.pointerId, startX: event.clientX, moved: false };
      wrapperRef.current?.setPointerCapture?.(event.pointerId);
   };

   const onPointerMove = (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const delta = daysFromPixels(event.clientX - drag.startX, dayWidth);
      if (delta !== 0) drag.moved = true;
      if (drag.moved) setDraft(rescheduleRange(base, drag.mode, delta));
   };

   const endDrag = (event: React.PointerEvent, commit: boolean) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      wrapperRef.current?.releasePointerCapture?.(event.pointerId);
      const next = draftRef.current;
      setDraft(null);
      if (commit && drag.moved && next && !sameRange(next, base)) onReschedule(project, next);
   };

   const onKeyDown = (event: React.KeyboardEvent) => {
      if (!reschedulable) return;
      const delta = keyboardRescheduleDelta(event);
      if (delta === null) return;
      event.preventDefault();
      onReschedule(project, rescheduleRange(base, 'move', delta));
   };

   const blockedLabel =
      blockedBy.length === 0
         ? null
         : `Blocked: ${blockedBy[0].name} late${blockedBy.length > 1 ? ` +${blockedBy.length - 1}` : ''}`;

   return (
      <div
         ref={wrapperRef}
         className={cn('group absolute h-7', draft !== null && 'select-none')}
         style={{ left, width, top: BAR_TOP, height: BAR_HEIGHT }}
         onPointerMove={onPointerMove}
         onPointerUp={(event) => endDrag(event, true)}
         onPointerCancel={(event) => endDrag(event, false)}
      >
         <button
            type="button"
            onPointerDown={beginDrag('move')}
            onKeyDown={onKeyDown}
            aria-label={`${project.name}, ${rangeLabel}`}
            aria-describedby={reschedulable ? RESCHEDULE_HINT_ID : undefined}
            data-testid={`roadmap-bar-${project.id}`}
            className={cn(
               'absolute inset-0 flex items-center gap-1.5 overflow-hidden rounded-lg border bg-accent/40 px-2.5 text-xs transition-colors hover:bg-accent',
               reschedulable && (draft !== null ? 'cursor-grabbing' : 'cursor-grab'),
               draft !== null && 'border-primary/60 bg-accent',
               blockedLabel && 'border-destructive/50'
            )}
         >
            <span className="truncate font-medium">{project.name}</span>
            <span className="shrink-0 text-muted-foreground">{project.percentComplete}%</span>
         </button>

         {showMilestones &&
            milestones.map((milestone) => {
               const offset = offsetFor(milestone.targetDate, monthWidth) - left;
               if (offset < -6 || offset > width + 6) return null;
               return (
                  <Tooltip key={milestone.id}>
                     <TooltipTrigger asChild>
                        <span
                           data-testid={`roadmap-milestone-${milestone.id}`}
                           aria-label={`${milestone.name}, ${milestone.targetDate}`}
                           className={cn(
                              'absolute top-1/2 z-[2] size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border',
                              milestone.completed
                                 ? 'border-primary bg-primary'
                                 : 'border-foreground/60 bg-container'
                           )}
                           style={{ left: offset }}
                        />
                     </TooltipTrigger>
                     <TooltipContent side="top">
                        {milestone.name} · {milestone.targetDate}
                     </TooltipContent>
                  </Tooltip>
               );
            })}

         {blockedLabel && (
            <span
               className="pointer-events-none absolute left-full top-1/2 z-[3] ml-2 inline-flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
               data-testid={`roadmap-blocked-${project.id}`}
            >
               <AlertTriangle className="size-3" />
               {blockedLabel}
            </span>
         )}

         {reschedulable && (
            <>
               <span
                  aria-hidden="true"
                  data-testid={`roadmap-resize-start-${project.id}`}
                  onPointerDown={beginDrag('start')}
                  className="absolute inset-y-1 left-0 w-2 cursor-ew-resize rounded-l-lg bg-primary/40 opacity-0 transition-opacity group-hover:opacity-100"
               />
               <span
                  aria-hidden="true"
                  data-testid={`roadmap-resize-end-${project.id}`}
                  onPointerDown={beginDrag('end')}
                  className="absolute inset-y-1 right-0 w-2 cursor-ew-resize rounded-r-lg bg-primary/40 opacity-0 transition-opacity group-hover:opacity-100"
               />
            </>
         )}

         {draft !== null && (
            <span
               role="tooltip"
               className="pointer-events-none absolute -top-7 left-0 z-20 whitespace-nowrap rounded-md border bg-popover px-2 py-0.5 text-[11px] font-medium text-popover-foreground shadow-md"
            >
               {rangeLabel}
            </span>
         )}
      </div>
   );
}

/** Posição vertical de cada projeto, para as setas de dependência. */
interface RowLayout {
   projectId: string;
   top: number;
}

function layoutOf(groups: RoadmapRenderGroup[]): { rows: RowLayout[]; height: number } {
   const rows: RowLayout[] = [];
   let y = 0;
   for (const group of groups) {
      y += GROUP_HEADER_HEIGHT;
      for (const project of group.projects) {
         rows.push({ projectId: project.id, top: y });
         y += ROW_HEIGHT;
      }
   }
   return { rows, height: y };
}

/**
 * Setas entre as barras: saem do fim da dependência e chegam no início de quem
 * depende dela, contornando por baixo quando as barras estão na mesma faixa.
 * Aresta em atraso usa o token destructive; as demais, o muted-foreground.
 */
function DependencyArrows({
   dependencies,
   boundsById,
   topById,
   width,
   height,
}: {
   dependencies: RoadmapDependency[];
   boundsById: Map<string, BarBounds>;
   topById: Map<string, number>;
   width: number;
   height: number;
}) {
   const paths = dependencies.flatMap((dep) => {
      const from = boundsById.get(dep.dependsOnId);
      const to = boundsById.get(dep.projectId);
      const fromTop = topById.get(dep.dependsOnId);
      const toTop = topById.get(dep.projectId);
      if (!from || !to || fromTop === undefined || toTop === undefined) return [];
      const x1 = from.left + from.width;
      const y1 = fromTop + BAR_TOP + BAR_HEIGHT / 2;
      const x2 = to.left;
      const y2 = toTop + BAR_TOP + BAR_HEIGHT / 2;
      // Cotovelo: sai na horizontal, desce/sobe no meio e entra na horizontal.
      const midX = x2 - 12;
      const d = `M ${x1} ${y1} H ${Math.max(midX, x1 + 6)} V ${y2} H ${x2 - 4}`;
      return [{ key: `${dep.dependsOnId}->${dep.projectId}`, d, late: dep.late }];
   });

   if (paths.length === 0) return null;

   return (
      <svg
         className="pointer-events-none absolute left-0 top-0 z-[4] overflow-visible"
         width={width}
         height={height}
         aria-hidden="true"
         data-testid="roadmap-dependency-arrows"
      >
         <defs>
            <marker
               id="roadmap-arrow"
               markerWidth="6"
               markerHeight="6"
               refX="5"
               refY="3"
               orient="auto"
            >
               <path d="M0,0 L6,3 L0,6 z" fill="var(--muted-foreground)" />
            </marker>
            <marker
               id="roadmap-arrow-late"
               markerWidth="6"
               markerHeight="6"
               refX="5"
               refY="3"
               orient="auto"
            >
               <path d="M0,0 L6,3 L0,6 z" fill="var(--destructive)" />
            </marker>
         </defs>
         {paths.map((path) => (
            <path
               key={path.key}
               d={path.d}
               fill="none"
               strokeWidth={1.5}
               stroke={path.late ? 'var(--destructive)' : 'var(--muted-foreground)'}
               strokeOpacity={path.late ? 0.9 : 0.45}
               strokeDasharray={path.late ? '4 3' : undefined}
               markerEnd={`url(#${path.late ? 'roadmap-arrow-late' : 'roadmap-arrow'})`}
            />
         ))}
      </svg>
   );
}

/**
 * Roadmap: régua de meses compartilhada com a timeline de projetos, uma faixa por
 * initiative (indentada pela hierarquia, com o progresso agregado da subárvore) e as
 * setas de dependência sobre as barras.
 */
export default function RoadmapTimeline({
   groups,
   milestones,
   dependencies,
   zoom,
   showDependencies,
   showMilestones,
   showProjectList,
}: RoadmapTimelineProps) {
   const patchProject = useWorkspaceStore((s) => s.patchProject);
   const [todayIso, setTodayIso] = useState<string | null>(null);
   const scrollRef = useRef<HTMLDivElement>(null);

   const monthWidth = monthWidthOf(zoom);
   const totalWidth = totalWidthOf(monthWidth);
   const listOffset = showProjectList ? LIST_WIDTH : 0;
   const todayOffset = todayIso !== null ? offsetFor(todayIso, monthWidth) : null;
   const todayLabel = todayIso !== null ? format(parseISO(todayIso), 'MMM d').toUpperCase() : null;
   const scaleDates = zoom === 'year' ? BIWEEKLY_DATES : WEEKLY_DATES;

   const { rows, height } = useMemo(() => layoutOf(groups), [groups]);
   const projectsById = useMemo(() => {
      const map = new Map<string, Project>();
      for (const group of groups)
         for (const project of group.projects) map.set(project.id, project);
      return map;
   }, [groups]);
   const topById = useMemo(() => new Map(rows.map((r) => [r.projectId, r.top])), [rows]);
   const boundsById = useMemo(() => {
      const map = new Map<string, BarBounds>();
      for (const project of projectsById.values()) {
         const bounds = boundsOf(project, monthWidth);
         if (bounds) map.set(project.id, bounds);
      }
      return map;
   }, [projectsById, monthWidth]);
   const milestonesByProject = useMemo(() => {
      const map = new Map<string, RoadmapMilestone[]>();
      for (const milestone of milestones) {
         const arr = map.get(milestone.projectId) ?? [];
         arr.push(milestone);
         map.set(milestone.projectId, arr);
      }
      return map;
   }, [milestones]);
   /** Dependências ATRASADAS por projeto dependente (alimentam a badge "Blocked"). */
   const blockedByProject = useMemo(() => {
      const map = new Map<string, { name: string; reason: 'overlap' | 'overdue' | null }[]>();
      for (const dep of dependencies) {
         if (!dep.late) continue;
         const arr = map.get(dep.projectId) ?? [];
         arr.push({
            name: projectsById.get(dep.dependsOnId)?.name ?? dep.dependsOnId,
            reason: dep.reason,
         });
         map.set(dep.projectId, arr);
      }
      return map;
   }, [dependencies, projectsById]);

   // "Hoje" só no cliente (SSR safe) e centralizado no primeiro render.
   useEffect(() => {
      const iso = new Date().toISOString().slice(0, 10);
      setTodayIso(iso);
      if (scrollRef.current) {
         const offset = offsetFor(iso, monthWidth);
         const anchor = Math.max(scrollRef.current.clientWidth / 2, listOffset + 80);
         scrollRef.current.scrollLeft = Math.max(0, offset - anchor);
      }
      // Só no mount: mudar o zoom depois não deve arrastar a viewport de volta pra hoje.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   const reschedule = useCallback(
      (project: Project, next: DateRange) => {
         // O store já fez rollback + toast; a rejeição re-lançada não tem mais o que tratar.
         void patchProject(project.id, next, next).catch(() => undefined);
      },
      [patchProject]
   );

   if (groups.length === 0) {
      return (
         <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            No projects to plot on the roadmap yet.
         </div>
      );
   }

   return (
      <TooltipProvider delayDuration={200}>
         <p id={RESCHEDULE_HINT_ID} className="sr-only">
            Drag the bar to move the project, drag its edges to change one date. With the bar
            focused, use the arrow keys to move by one day and Shift + arrow keys by one week.
         </p>
         <div ref={scrollRef} className="h-full w-full overflow-auto">
            <div style={{ width: totalWidth }} className="relative min-h-full">
               {/* Régua: meses, ticks semanais e rótulos de data */}
               <div className="sticky top-0 z-20 select-none bg-container">
                  <div className="relative flex h-4">
                     {MONTHS.map((month) => (
                        <div
                           key={month.key}
                           style={{ width: month.days * dayWidthOf(monthWidth) }}
                           className="h-4 shrink-0 overflow-hidden whitespace-nowrap text-xs font-medium uppercase leading-4 text-muted-foreground"
                        >
                           {month.label}
                        </div>
                     ))}
                     <div className="pointer-events-none absolute inset-x-0 bottom-0">
                        {WEEKLY_DATES.map((date) => (
                           <span
                              key={date.time}
                              className="absolute bottom-0 h-1 w-px bg-muted-foreground/30"
                              style={{ left: offsetForTime(date.time, monthWidth) }}
                           />
                        ))}
                     </div>
                  </div>
                  <div className="relative h-4">
                     {scaleDates.map((date) => {
                        const left = offsetForTime(date.time, monthWidth);
                        if (todayOffset !== null && Math.abs(left - todayOffset) < 30) return null;
                        return (
                           <span
                              key={date.time}
                              className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground/80"
                              style={{ left }}
                           >
                              {date.day}
                           </span>
                        );
                     })}
                     {todayOffset !== null && (
                        <span
                           className="pointer-events-none absolute -top-0.5 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold uppercase text-primary-foreground"
                           style={{ left: todayOffset }}
                        >
                           {todayLabel}
                        </span>
                     )}
                  </div>
               </div>

               {/* Linhas de mês */}
               <div className="pointer-events-none absolute inset-0 top-8 flex">
                  {MONTHS.map((month) => (
                     <div
                        key={month.key}
                        style={{ width: month.days * dayWidthOf(monthWidth) }}
                        className="h-full shrink-0 border-r border-border/25"
                     />
                  ))}
               </div>

               {/* Marcador de hoje */}
               {todayOffset !== null && (
                  <div
                     className="absolute bottom-0 top-8 z-10 w-px bg-primary"
                     style={{ left: todayOffset }}
                  />
               )}

               {/* Grupos e barras */}
               <div className="relative z-[5] pb-8" style={{ minHeight: height }}>
                  {showDependencies && (
                     <DependencyArrows
                        dependencies={dependencies}
                        boundsById={boundsById}
                        topById={topById}
                        width={totalWidth}
                        height={height}
                     />
                  )}
                  {groups.map((group) => (
                     <div key={group.id}>
                        <div
                           className="sticky left-0 flex w-screen max-w-full items-center gap-2 border-y border-border/40 bg-[color-mix(in_oklab,var(--accent)_30%,var(--container))] px-4 text-sm font-medium"
                           style={{
                              height: GROUP_HEADER_HEIGHT,
                              paddingLeft: 16 + group.depth * 16,
                           }}
                        >
                           {group.icon ? (
                              <span>{group.icon}</span>
                           ) : (
                              <Compass className="size-3.5 text-muted-foreground" />
                           )}
                           <span className="truncate">{group.name}</span>
                           <span className="text-xs text-muted-foreground">
                              {group.completedProjectCount}/{group.projectCount}
                           </span>
                           <CapacityRing value={group.percentComplete} color="var(--primary)" />
                           <span className="text-xs text-muted-foreground">
                              {group.percentComplete}%
                           </span>
                        </div>
                        {group.projects.map((project) => (
                           <div
                              key={project.id}
                              className="relative flex items-center"
                              style={{ height: ROW_HEIGHT }}
                           >
                              {isValidProjectDate(project.startDate) && (
                                 <RoadmapBar
                                    project={project}
                                    monthWidth={monthWidth}
                                    milestones={milestonesByProject.get(project.id) ?? []}
                                    blockedBy={blockedByProject.get(project.id) ?? []}
                                    showMilestones={showMilestones}
                                    onReschedule={reschedule}
                                 />
                              )}
                              {showProjectList && (
                                 <div
                                    className="sticky left-0 z-10 flex h-full shrink-0 items-center gap-1 border-r border-border/40 bg-container/95 px-[13px] pr-[10px] text-[13px] font-medium leading-4 backdrop-blur-sm"
                                    style={{ width: LIST_WIDTH }}
                                 >
                                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md">
                                       <project.icon className="size-4" />
                                    </span>
                                    <span className="flex-1 truncate">{project.name}</span>
                                    <span
                                       className="size-2 shrink-0 rounded-full"
                                       style={{ backgroundColor: project.health.color }}
                                    />
                                    {project.lead && (
                                       <Avatar className="size-4 shrink-0">
                                          <AvatarImage
                                             src={project.lead.avatarUrl || undefined}
                                             alt={project.lead.name}
                                          />
                                          <AvatarFallback>{project.lead.name[0]}</AvatarFallback>
                                       </Avatar>
                                    )}
                                 </div>
                              )}
                           </div>
                        ))}
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </TooltipProvider>
   );
}
