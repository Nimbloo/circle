'use client';

import { CapacityRing } from '@/components/common/cycles/capacity-ring';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
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
   ZOOM_LEVELS,
   dayWidthOf,
   monthWidthOf,
   offsetFor,
   offsetForTime,
   totalWidthOf,
} from '@/lib/timeline-scale';
import { Project } from '@/data/projects';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, ArrowRight, Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectPeekPanel } from './project-peek-panel';
import { ProjectGroup } from './projects';

interface ProjectsTimelineProps {
   groups: ProjectGroup[];
}

/* A régua (intervalo, meses, zoom, data ↔ pixel) vive em `lib/timeline-scale.ts`,
   compartilhada com o Roadmap para as duas telas terem a MESMA geometria. */

const barBounds = (project: Project, monthWidth: number) => {
   const left = offsetFor(project.startDate, monthWidth);
   const right = Math.max(
      offsetFor(
         isValidProjectDate(project.targetDate) ? project.targetDate : project.startDate,
         monthWidth
      ),
      left + 130
   );
   return { left, right };
};

interface Viewport {
   left: number;
   width: number;
}

/**
 * "← Jul 15 - Aug 28" indicator shown when a bar is outside the viewport.
 * Pinned with position: sticky (pure CSS) so it never drifts during fast
 * scrolling — JS is only used to decide which side to show.
 */
function OutOfViewIndicator({
   project,
   viewport,
   listOffset,
   monthWidth,
   onJump,
}: {
   project: Project;
   viewport: Viewport;
   listOffset: number;
   monthWidth: number;
   onJump: (contentX: number) => void;
}) {
   const { left, right } = barBounds(project, monthWidth);
   const visibleLeft = viewport.left + listOffset;
   const visibleRight = viewport.left + viewport.width;

   if (right >= visibleLeft + 4 && left <= visibleRight - 4) return null;

   const isPast = right < visibleLeft + 4;
   const label = projectDateRangeLabel(project.startDate, project.targetDate);
   if (label === null) return null;

   return (
      <button
         type="button"
         onClick={() => onJump(left)}
         className={cn(
            'sticky z-[6] flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap pointer-events-auto',
            !isPast && 'ml-auto'
         )}
         style={isPast ? { left: listOffset + 16 } : { right: 16 }}
      >
         {isPast && <ArrowLeft className="size-3.5" />}
         {label}
         {!isPast && <ArrowRight className="size-3.5" />}
      </button>
   );
}

interface ActiveDrag {
   mode: RescheduleMode;
   pointerId: number;
   startX: number;
   /** Só vira `true` após o primeiro snap (evita tratar um clique como arraste). */
   moved: boolean;
}

/** Instrução de teclado dos leitores de tela (aria-describedby das barras). */
const RESCHEDULE_HINT_ID = 'projects-timeline-reschedule-hint';

/**
 * Barra do projeto. Com as duas datas válidas ela é arrastável: o corpo desloca
 * `startDate` e `targetDate` juntos, as alças mudam só uma ponta (snap por dia,
 * PATCH ao soltar). Com a barra focada, ←/→ movem 1 dia e Shift+←/→ 7 dias.
 * Sem target date a barra fica estática (estado honesto) — só abre o peek.
 */
function TimelineBar({
   project,
   monthWidth,
   selected,
   onSelect,
   onReschedule,
}: {
   project: Project;
   monthWidth: number;
   selected: boolean;
   onSelect: (projectId: string) => void;
   onReschedule: (project: Project, next: DateRange) => void;
}) {
   const { displayProperties } = useProjectsDisplayStore();
   const reschedulable = isValidProjectDate(project.targetDate);
   const base: DateRange = {
      startDate: project.startDate,
      targetDate: isValidProjectDate(project.targetDate) ? project.targetDate : project.startDate,
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
   /** Um arraste termina com um `click` nativo: não abrir o peek nesse caso. */
   const suppressClickRef = useRef(false);

   const range = draft ?? base;
   const left = offsetFor(range.startDate, monthWidth);
   const right = offsetFor(range.targetDate, monthWidth);
   const width = Math.max(right - left, 130);
   const dayWidth = dayWidthOf(monthWidth);
   const rangeLabel = projectDateRangeLabel(range.startDate, range.targetDate) ?? range.startDate;

   const beginDrag = (mode: RescheduleMode) => (event: React.PointerEvent) => {
      if (!reschedulable || event.button !== 0) return;
      event.stopPropagation();
      dragRef.current = { mode, pointerId: event.pointerId, startX: event.clientX, moved: false };
      // Captura no wrapper: move/up chegam nele mesmo quando o ponteiro sai da alça.
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
      suppressClickRef.current = drag.moved;
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

   const onClick = () => {
      if (suppressClickRef.current) {
         suppressClickRef.current = false;
         return;
      }
      onSelect(project.id);
   };

   return (
      <div className="absolute inset-0">
         <div
            ref={wrapperRef}
            className={cn('group absolute top-5 h-8', draft !== null && 'select-none')}
            style={{ left, width }}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => endDrag(event, true)}
            onPointerCancel={(event) => endDrag(event, false)}
         >
            <button
               type="button"
               onClick={onClick}
               onPointerDown={beginDrag('move')}
               onKeyDown={onKeyDown}
               aria-label={`${project.name}, ${rangeLabel}`}
               aria-describedby={reschedulable ? RESCHEDULE_HINT_ID : undefined}
               aria-keyshortcuts={
                  reschedulable
                     ? 'ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight'
                     : undefined
               }
               data-reschedulable={reschedulable}
               className={cn(
                  'absolute inset-0 flex items-center gap-1.5 rounded-lg border bg-accent/40 hover:bg-accent px-2.5 text-xs transition-colors overflow-hidden',
                  selected && 'border-dashed border-violet-500 bg-accent',
                  reschedulable && (draft !== null ? 'cursor-grabbing' : 'cursor-grab'),
                  draft !== null && 'border-primary/60 bg-accent'
               )}
            >
               <span className="truncate font-medium">{project.name}</span>
               {displayProperties.lead && project.lead && (
                  <Avatar className="size-4 shrink-0">
                     <AvatarImage
                        src={project.lead.avatarUrl || undefined}
                        alt={project.lead.name}
                     />
                     <AvatarFallback>{project.lead.name[0]}</AvatarFallback>
                  </Avatar>
               )}
               {displayProperties.status && (
                  <span className="text-muted-foreground shrink-0">{project.percentComplete}%</span>
               )}
            </button>
            {reschedulable && (
               <>
                  <span
                     aria-hidden="true"
                     data-testid={`resize-start-${project.id}`}
                     onPointerDown={beginDrag('start')}
                     className="absolute inset-y-1 left-0 w-2 cursor-ew-resize rounded-l-lg bg-primary/40 opacity-0 transition-opacity group-hover:opacity-100"
                  />
                  <span
                     aria-hidden="true"
                     data-testid={`resize-end-${project.id}`}
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
      </div>
   );
}

/**
 * Projects "Timeline" view (the default): month scale, grouped rows,
 * date-positioned bars and a Today marker. The left project list, week
 * numbers and bar contents follow the Display options; the scale dropdown
 * (Year / Quarter / Month / Week, with Y/Q/M/W shortcuts) changes the zoom.
 */
export default function ProjectsTimeline({ groups }: ProjectsTimelineProps) {
   const { showProjectList, showWeekNumbers, displayProperties } = useProjectsDisplayStore();
   const patchProject = useWorkspaceStore((s) => s.patchProject);
   const [todayIso, setTodayIso] = useState<string | null>(null);
   const [viewport, setViewport] = useState<Viewport | null>(null);
   const [zoom, setZoom] = useState<TimelineZoom>('year');
   const [peekProjectId, setPeekProjectId] = useState<string | null>(null);
   const scrollRef = useRef<HTMLDivElement>(null);
   const frameRef = useRef<number | null>(null);

   const monthWidth = monthWidthOf(zoom);
   const totalWidth = totalWidthOf(monthWidth);
   const listOffset = showProjectList ? LIST_WIDTH : 0;
   const todayOffset = todayIso !== null ? offsetFor(todayIso, monthWidth) : null;
   const todayLabel = todayIso !== null ? format(parseISO(todayIso), 'MMM d').toUpperCase() : null;
   /** The line would sit on the sticky project list → hide it (the pill stays on the scale). */
   const todayOverlapsList =
      viewport !== null && todayOffset !== null && todayOffset < viewport.left + listOffset + 28;
   /** Date labels: every other Monday zoomed out, every Monday zoomed in. */
   const scaleDates = zoom === 'year' ? BIWEEKLY_DATES : WEEKLY_DATES;

   const syncViewport = useCallback(() => {
      if (!scrollRef.current) return;
      setViewport({ left: scrollRef.current.scrollLeft, width: scrollRef.current.clientWidth });
   }, []);

   const handleScroll = useCallback(() => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
         frameRef.current = null;
         syncViewport();
      });
   }, [syncViewport]);

   useEffect(() => {
      const iso = new Date().toISOString().slice(0, 10);
      setTodayIso(iso);
      // Bring today into view on mount (centered, but always
      // clear of the sticky project list so the line stays visible).
      if (scrollRef.current) {
         const offset = offsetFor(iso, monthWidthOf('year'));
         const listWidth = useProjectsDisplayStore.getState().showProjectList ? LIST_WIDTH : 0;
         const anchor = Math.max(scrollRef.current.clientWidth / 2, listWidth + 80);
         scrollRef.current.scrollLeft = Math.max(0, offset - anchor);
      }
      syncViewport();
      return () => {
         if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      };
   }, [syncViewport]);

   /** Change zoom while keeping the date at the middle of the viewport anchored. */
   const setZoomLevel = useCallback(
      (next: TimelineZoom) => {
         if (next === zoom) return;
         const element = scrollRef.current;
         setZoom(next);
         if (element) {
            const previousWidth = totalWidthOf(monthWidthOf(zoom));
            const nextWidth = totalWidthOf(monthWidthOf(next));
            const anchor = (element.scrollLeft + element.clientWidth / 2) / previousWidth;
            requestAnimationFrame(() => {
               element.scrollLeft = anchor * nextWidth - element.clientWidth / 2;
               syncViewport();
            });
         }
      },
      [zoom, syncViewport]
   );

   // Y / Q / M / W keyboard shortcuts (ignored while typing).
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.metaKey || event.ctrlKey || event.altKey) return;
         const target = event.target as HTMLElement | null;
         if (
            target &&
            (target.tagName === 'INPUT' ||
               target.tagName === 'TEXTAREA' ||
               target.isContentEditable)
         ) {
            return;
         }
         const level = ZOOM_LEVELS.find(
            (candidate) => candidate.shortcut.toLowerCase() === event.key.toLowerCase()
         );
         if (level) setZoomLevel(level.id);
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [setZoomLevel]);

   const jumpTo = useCallback(
      (contentX: number) => {
         if (!scrollRef.current) return;
         const anchor = Math.max(scrollRef.current.clientWidth / 2, listOffset + 80);
         scrollRef.current.scrollTo({
            left: Math.max(0, contentX - anchor),
            behavior: 'smooth',
         });
      },
      [listOffset]
   );

   const reschedule = useCallback(
      (project: Project, next: DateRange) => {
         // O store já fez rollback + toast; a rejeição re-lançada não tem mais o que tratar.
         void patchProject(project.id, next, next).catch(() => undefined);
      },
      [patchProject]
   );

   const scrollToToday = () => {
      if (scrollRef.current && todayOffset !== null) {
         // Land today clear of the sticky project list, so on small screens
         // the line never ends up hidden behind it.
         const anchor = Math.max(scrollRef.current.clientWidth / 2, listOffset + 80);
         scrollRef.current.scrollTo({
            left: Math.max(0, todayOffset - anchor),
            behavior: 'smooth',
         });
      }
   };

   return (
      <div className="relative w-full h-full">
         {peekProjectId !== null && (
            <ProjectPeekPanel projectId={peekProjectId} onClose={() => setPeekProjectId(null)} />
         )}
         {/* Floating scale controls (Linear-style) */}
         <div className="absolute top-[5px] right-[10px] z-30 flex items-center gap-1">
            <button
               type="button"
               onClick={scrollToToday}
               className="h-6 px-2 rounded-full border border-transparent bg-secondary text-xs font-medium hover:bg-accent transition-colors"
            >
               Today
            </button>
            <DropdownMenu>
               <DropdownMenuTrigger className="h-6 px-2 rounded-full border border-transparent bg-secondary text-xs font-medium hover:bg-accent transition-colors inline-flex items-center gap-0.5 outline-none">
                  {ZOOM_LEVELS.find((level) => level.id === zoom)!.label}
                  <ChevronDown className="size-3 text-muted-foreground" />
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-40">
                  {ZOOM_LEVELS.map((level) => (
                     <DropdownMenuItem
                        key={level.id}
                        onClick={() => setZoomLevel(level.id)}
                        className="flex items-center gap-2 text-sm"
                     >
                        <span className="flex-1">{level.label}</span>
                        {zoom === level.id && <Check className="size-3.5" />}
                        <span className="text-xs text-muted-foreground">{level.shortcut}</span>
                     </DropdownMenuItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>

         <p id={RESCHEDULE_HINT_ID} className="sr-only">
            Drag the bar to move the project, drag its edges to change one date. With the bar
            focused, use the arrow keys to move by one day and Shift + arrow keys by one week.
         </p>
         <div ref={scrollRef} onScroll={handleScroll} className="w-full h-full overflow-auto">
            <div style={{ width: totalWidth }} className="relative min-h-full">
               {/* Month scale: month names, weekly ticks and date labels */}
               <div className="sticky top-0 z-20 bg-container select-none">
                  <div className="relative flex h-4">
                     {MONTHS.map((month) => (
                        <div
                           key={month.key}
                           style={{ width: month.days * dayWidthOf(monthWidth) }}
                           className="h-4 shrink-0 text-xs leading-4 font-medium text-muted-foreground uppercase whitespace-nowrap overflow-hidden"
                        >
                           {month.label}
                        </div>
                     ))}
                     {/* Weekly tick marks */}
                     <div className="absolute inset-x-0 bottom-0 pointer-events-none">
                        {WEEKLY_DATES.map((date) => (
                           <span
                              key={date.time}
                              className="absolute bottom-0 h-1 w-px bg-muted-foreground/30"
                              style={{ left: offsetForTime(date.time, monthWidth) }}
                           />
                        ))}
                     </div>
                  </div>
                  {/* Date labels (every other Monday at the Year zoom, weekly beyond) */}
                  <div className="relative h-4">
                     {scaleDates.map((date) => {
                        const left = offsetForTime(date.time, monthWidth);
                        if (todayOffset !== null && Math.abs(left - todayOffset) < 30) return null;
                        return (
                           <span
                              key={date.time}
                              className="absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground/80 whitespace-nowrap"
                              style={{ left }}
                           >
                              {showWeekNumbers ? `W${date.week}` : date.day}
                           </span>
                        );
                     })}
                     {/* Today pill, pinned to the scale */}
                     {todayOffset !== null && (
                        <span
                           className="absolute -top-0.5 -translate-x-1/2 text-[10px] font-semibold bg-primary text-primary-foreground rounded-full px-1.5 py-px uppercase whitespace-nowrap pointer-events-none z-10"
                           style={{ left: todayOffset }}
                        >
                           {todayLabel}
                        </span>
                     )}
                  </div>
               </div>

               {/* Month grid lines */}
               <div className="absolute inset-0 top-8 flex pointer-events-none">
                  {MONTHS.map((month) => (
                     <div
                        key={month.key}
                        style={{ width: month.days * dayWidthOf(monthWidth) }}
                        className="shrink-0 border-r border-border/25 h-full"
                     />
                  ))}
               </div>

               {/* Today marker (hidden while it overlaps the sticky project list) */}
               {todayOffset !== null && !todayOverlapsList && (
                  <div
                     className="absolute top-8 bottom-0 w-px bg-primary z-10"
                     style={{ left: todayOffset }}
                  />
               )}

               {/* Groups */}
               <div className="relative z-[5] pb-8">
                  {groups.map((group) => (
                     <div key={group.id}>
                        {group.id !== 'all' && (
                           <div className="sticky left-0 flex items-center gap-2 px-4 h-9 text-sm font-medium bg-[color-mix(in_oklab,var(--accent)_30%,var(--container))] border-y border-border/40 w-screen max-w-full">
                              {group.icon && <span>{group.icon}</span>}
                              {group.name}
                              <span className="text-xs text-muted-foreground">
                                 {group.projects.length}
                              </span>
                           </div>
                        )}
                        <div className={cn(group.id !== 'all' && 'py-1')}>
                           {group.projects.map((project) => (
                              <div key={project.id} className="relative h-[72px] flex items-center">
                                 {isValidProjectDate(project.startDate) && (
                                    <TimelineBar
                                       project={project}
                                       monthWidth={monthWidth}
                                       selected={peekProjectId === project.id}
                                       onSelect={(projectId) =>
                                          setPeekProjectId((current) =>
                                             current === projectId ? null : projectId
                                          )
                                       }
                                       onReschedule={reschedule}
                                    />
                                 )}
                                 {showProjectList && (
                                    <div className="sticky left-0 z-10 flex h-[72px] w-[312px] shrink-0 items-center gap-1 px-[13px] pr-[10px] bg-container/95 backdrop-blur-sm text-[13px] leading-4 font-medium border-r border-border/40">
                                       <span className="inline-flex size-7 items-center justify-center rounded-md shrink-0">
                                          <project.icon className="size-4" />
                                       </span>
                                       <span className="truncate flex-1">{project.name}</span>
                                       {displayProperties.health && (
                                          <span
                                             className="size-2 rounded-full shrink-0"
                                             style={{ backgroundColor: project.health.color }}
                                          />
                                       )}
                                       {displayProperties.status && (
                                          <CapacityRing
                                             value={project.percentComplete}
                                             color="var(--primary)"
                                          />
                                       )}
                                       {displayProperties.priority && (
                                          <project.priority.icon
                                             className={cn('size-3 shrink-0 text-muted-foreground')}
                                          />
                                       )}
                                       {displayProperties.lead && project.lead && (
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
                                 {viewport && isValidProjectDate(project.startDate) && (
                                    <OutOfViewIndicator
                                       project={project}
                                       viewport={viewport}
                                       listOffset={listOffset}
                                       monthWidth={monthWidth}
                                       onJump={jumpTo}
                                    />
                                 )}
                              </div>
                           ))}
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>
   );
}
