'use client';

import { CapacityRing } from '@/components/common/cycles/capacity-ring';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Project } from '@/data/projects';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import { format, parseISO } from 'date-fns';
import { Calendar } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProjectGroup } from './projects';
import { ProjectContextMenu } from './project-context-menu';

function ProjectCard({ project }: { project: Project }) {
   const { orgId } = useParams<{ orgId: string }>();
   const displayProperties = useProjectsDisplayStore((state) => state.displayProperties);
   // % de conclusão vem pronto do backend (assemble calcula por agregação).
   const percentComplete = project.percentComplete;

   return (
      <ProjectContextMenu project={project}>
         <div className="min-h-[94px] rounded-lg bg-card px-1.5 py-[5px] shadow-[var(--card-shadow)] transition-colors hover:bg-accent/30">
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

/** Projects "Board" view: one 354px column per project status. */
export default function ProjectsBoard({ groups }: { groups: ProjectGroup[] }) {
   return (
      <div className="h-full w-full overflow-x-auto">
         <div className="flex h-full min-w-max gap-0 px-1">
            {groups.map((group) => (
               <div key={group.id} className="flex h-full w-[354px] shrink-0 flex-col">
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
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4 pl-[13px] pr-4 pt-[9px]">
                     {group.projects.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                     ))}
                  </div>
               </div>
            ))}
         </div>
      </div>
   );
}
