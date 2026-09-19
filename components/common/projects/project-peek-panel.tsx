'use client';

import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { format, parseISO } from 'date-fns';
import { ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { ProjectProgressChart, PROGRESS_COLORS } from './details/project-progress-chart';
import { useSharedProjectDetail } from './details/use-project-detail';
import { ProjectPropertyRows } from './project-property-fields';

interface ProjectPeekPanelProps {
   projectId: string;
   onClose: () => void;
}

const formatDay = (iso?: string) => (iso ? format(parseISO(iso), 'MMM do') : '—');

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
   return (
      <div className={`rounded-xl border bg-container shadow-lg p-4 ${className ?? ''}`}>
         {children}
      </div>
   );
}

/**
 * Floating panel opened in place when a project bar is clicked on the
 * timeline (Linear-style "peek"): header, properties, milestones and
 * progress cards stacked over the right side of the timeline.
 */
export function ProjectPeekPanel({ projectId, onClose }: ProjectPeekPanelProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const allIssues = useIssuesStore((s) => s.issues);

   const project = useWorkspaceStore((s) => s.getProjectById(projectId));

   // Mesmo hook do detalhe da rota (#45): sequência + live reload do projeto.
   const { detail } = useSharedProjectDetail(projectId);

   const issues = useMemo(
      () => allIssues.filter((issue) => issue.project?.id === projectId),
      [allIssues, projectId]
   );

   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [onClose]);

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

   if (!project) return null;

   const started = issues.filter((issue) => issue.status.category === 'started').length;
   const completed = issues.filter((issue) => issue.status.category === 'completed').length;

   return (
      <aside className="absolute top-10 right-2 bottom-2 w-[400px] max-w-[calc(100%-1rem)] z-40 flex flex-col gap-2 overflow-y-auto">
         {/* Header */}
         <Card className="flex items-center gap-2 py-3">
            <span className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0">
               <project.icon className="size-3.5" />
            </span>
            <Link
               href={`/${orgId}/project/${project.id}/overview`}
               className="flex-1 min-w-0 flex items-center gap-1.5 group"
               aria-label="Open project"
            >
               <span className="font-medium truncate group-hover:text-foreground/80 transition-colors">
                  {project.name}
               </span>
               <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
            <button
               onClick={onClose}
               className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
               aria-label="Close panel"
            >
               <X className="size-4" />
            </button>
         </Card>

         {/* Properties */}
         <Card>
            <div className="flex items-center justify-between mb-1.5">
               <h3 className="text-sm font-medium">Properties</h3>
            </div>
            <ProjectPropertyRows project={project} members={members} />
         </Card>

         {/* Milestones */}
         <Card>
            <div className="flex items-center justify-between mb-2">
               <h3 className="text-sm font-medium">Milestones</h3>
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
                        className="flex items-center justify-between gap-2 text-sm"
                     >
                        <span
                           className={
                              milestone.completed
                                 ? 'line-through text-muted-foreground truncate'
                                 : 'truncate'
                           }
                        >
                           {milestone.name}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                           {formatDay(milestone.targetDate)}
                        </span>
                     </div>
                  ))}
               </div>
            )}
         </Card>

         {/* Progress */}
         <Card>
            <h3 className="text-sm font-medium mb-3">Progress</h3>
            <div className="grid grid-cols-3 gap-2 mb-2">
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span
                        className="size-2 rounded-[2px]"
                        style={{ backgroundColor: PROGRESS_COLORS.scope }}
                     />
                     Scope
                  </div>
                  <span className="text-sm font-medium">{issues.length}</span>
               </div>
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span
                        className="size-2 rounded-[2px]"
                        style={{ backgroundColor: PROGRESS_COLORS.started }}
                     />
                     Started
                  </div>
                  <span className="text-sm font-medium">{started}</span>
               </div>
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span
                        className="size-2 rounded-[2px]"
                        style={{ backgroundColor: PROGRESS_COLORS.completed }}
                     />
                     Completed
                  </div>
                  <span className="text-sm font-medium">{completed}</span>
               </div>
            </div>
            <ProjectProgressChart
               startDate={project.startDate}
               endDate={project.targetDate ?? project.startDate}
               scope={issues.length}
               started={started}
               completed={completed}
            />
         </Card>
      </aside>
   );
}
