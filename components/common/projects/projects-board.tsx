'use client';

import { CapacityRing } from '@/components/common/cycles/capacity-ring';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Project } from '@/data/projects';
import { cn } from '@/lib/utils';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { format, parseISO } from 'date-fns';
import { Calendar } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useRef } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ProjectGroup } from './projects';
import { ProjectContextMenu } from './project-context-menu';

export const ProjectDragType = 'PROJECT';
/** Instrução de DnD lida por leitores de tela (aria-describedby dos cards). */
const DRAG_HINT_ID = 'projects-board-drag-hint';

function ProjectCard({ project }: { project: Project }) {
   const { orgId } = useParams<{ orgId: string }>();
   const displayProperties = useProjectsDisplayStore((state) => state.displayProperties);
   const ref = useRef<HTMLDivElement>(null);
   // % de conclusão vem pronto do backend (assemble calcula por agregação).
   const percentComplete = project.percentComplete;

   const [{ isDragging }, drag] = useDrag(
      () => ({
         type: ProjectDragType,
         item: project,
         collect: (monitor) => ({ isDragging: monitor.isDragging() }),
      }),
      [project]
   );
   drag(ref);

   return (
      <ProjectContextMenu project={project}>
         <div
            ref={ref}
            role="listitem"
            aria-grabbed={isDragging}
            aria-describedby={DRAG_HINT_ID}
            className={cn(
               'min-h-[94px] rounded-lg bg-card px-1.5 py-[5px] shadow-[var(--card-shadow)] transition-colors hover:bg-accent/30',
               isDragging ? 'cursor-grabbing opacity-50' : 'cursor-grab'
            )}
         >
            <div className="flex h-7 items-center gap-4">
               <project.icon className="size-4 shrink-0" />
               <Link
                  href={`/${orgId}/project/${project.id}/overview`}
                  className="min-w-0 truncate text-[13px] font-medium leading-4 hover:underline hover:underline-offset-2"
               >
                  {project.name}
               </Link>
            </div>

            {displayProperties.health && (
               <div className="flex h-7 items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                     className="size-2 rounded-full shrink-0"
                     style={{ backgroundColor: project.health.color }}
                  />
                  {project.health.name}
                  {project.healthUpdatedAgoDays !== undefined && (
                     <span>· {project.healthUpdatedAgoDays}d</span>
                  )}
               </div>
            )}

            {displayProperties.labels && project.labels.length > 0 && (
               <div className="flex min-h-7 flex-wrap items-center gap-1">
                  {project.labels.map((label) => (
                     <span
                        key={label.id}
                        className="inline-flex items-center gap-1 text-[11px] border rounded-full px-1.5 py-px"
                     >
                        <span
                           className="size-1.5 rounded-full"
                           style={{ backgroundColor: label.color }}
                        />
                        {label.name}
                     </span>
                  ))}
               </div>
            )}

            <div className="flex h-7 items-center gap-2 text-xs text-muted-foreground">
               {displayProperties.status && (
                  <span className="inline-flex items-center gap-1">
                     <CapacityRing value={percentComplete} color="var(--primary)" />
                     {percentComplete}%
                  </span>
               )}
               {displayProperties.priority && (
                  <project.priority.icon className="size-3.5 shrink-0" />
               )}
               {displayProperties.targetDate && project.targetDate && (
                  <span className="inline-flex items-center gap-1">
                     <Calendar className="size-3" />
                     {format(parseISO(project.targetDate), 'MMM d')}
                  </span>
               )}
               {displayProperties.lead && project.lead && (
                  <Avatar className="size-4 ml-auto shrink-0">
                     <AvatarImage
                        src={project.lead.avatarUrl || undefined}
                        alt={project.lead.name}
                     />
                     <AvatarFallback>{project.lead.name[0]}</AvatarFallback>
                  </Avatar>
               )}
            </div>
         </div>
      </ProjectContextMenu>
   );
}

function BoardColumn({
   group,
   onDropProject,
}: {
   group: ProjectGroup;
   onDropProject: (project: Project, group: ProjectGroup) => void;
}) {
   const ref = useRef<HTMLDivElement>(null);
   const { status, teamId } = group;

   // Drop na coluna → o projeto adota o status (ou o time) da coluna; só entre colunas.
   const [{ isOver, canDrop }, drop] = useDrop(
      () => ({
         accept: ProjectDragType,
         canDrop: (item: Project) =>
            status ? item.status.id !== status.id : teamId !== undefined && item.teamId !== teamId,
         drop: (item: Project) => onDropProject(item, group),
         collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
      }),
      [group, status, teamId, onDropProject]
   );
   drop(ref);

   return (
      <div className="flex h-full w-[354px] shrink-0 flex-col">
         <div className="flex h-[50px] shrink-0 items-center gap-2 px-[18px] pt-0.5 text-[13px] font-medium">
            {group.status ? (
               <span
                  className="size-4 shrink-0 [&_svg]:size-4"
                  style={{ color: group.status.color }}
               >
                  <group.status.icon />
               </span>
            ) : (
               group.icon && <span>{group.icon}</span>
            )}
            <span>{group.name}</span>
            <span className="text-xs text-muted-foreground">{group.projects.length}</span>
         </div>
         <div
            ref={ref}
            role="list"
            aria-label={group.name}
            className={cn(
               'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg pb-4 pl-[13px] pr-4 pt-[9px] transition-colors',
               isOver && canDrop && 'bg-accent/40 ring-1 ring-inset ring-primary/40'
            )}
         >
            {group.projects.map((project) => (
               <ProjectCard key={project.id} project={project} />
            ))}
         </div>
      </div>
   );
}

/**
 * Projects "Board" view: one 354px column per group — status (padrão) ou time,
 * conforme o grouping do Display. Arrastar um card para outra coluna muda o
 * status (`statusId`) ou o time (`teamId`) do projeto (PATCH otimista; o store faz
 * rollback + toast no erro). A ordem dentro da coluna segue a ordenação do Display.
 */
export default function ProjectsBoard({ groups }: { groups: ProjectGroup[] }) {
   const patchProject = useWorkspaceStore((s) => s.patchProject);
   const byTeam = groups.some((group) => group.teamId !== undefined);

   const moveToGroup = useCallback(
      (project: Project, group: ProjectGroup) => {
         // O store já fez rollback + toast; a rejeição re-lançada não tem mais o que tratar.
         if (group.status) {
            const status = group.status;
            void patchProject(project.id, { status }, { statusId: status.id }).catch(
               () => undefined
            );
         } else if (group.teamId) {
            const teamId = group.teamId;
            void patchProject(project.id, { teamId }, { teamId }).catch(() => undefined);
         }
      },
      [patchProject]
   );

   return (
      <DndProvider backend={HTML5Backend}>
         <div className="h-full w-full overflow-x-auto">
            <p id={DRAG_HINT_ID} className="sr-only">
               Drag a project card to another column to change its {byTeam ? 'team' : 'status'}.
            </p>
            <div className="flex h-full min-w-max gap-0 px-1">
               {groups.map((group) => (
                  <BoardColumn key={group.id} group={group} onDropProject={moveToGroup} />
               ))}
            </div>
         </div>
      </DndProvider>
   );
}
