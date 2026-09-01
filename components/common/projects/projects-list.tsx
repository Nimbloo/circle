'use client';

import { useProjectsDisplayStore } from '@/store/projects-display-store';
import ProjectLine from './project-line';
import { ProjectGroup } from './projects';

/** Projects "List" view: compact table with optional team sections. */
export default function ProjectsList({ groups }: { groups: ProjectGroup[] }) {
   const { grouping, displayProperties } = useProjectsDisplayStore();

   return (
      <div className="h-full w-full overflow-y-auto">
         <div className="sticky top-0 z-10 flex h-8 items-center bg-container text-xs font-[450] leading-[15px] text-[var(--table-header-foreground)]">
            <div className="w-[38px] shrink-0" />
            <div className="min-w-0 flex-1 px-1.5">Name</div>
            {displayProperties.health && (
               <div className="hidden w-[136px] shrink-0 px-3 sm:block">Health</div>
            )}
            {displayProperties.priority && (
               <div className="hidden w-[68px] shrink-0 px-3 md:block">Priority</div>
            )}
            {displayProperties.lead && (
               <div className="hidden w-[132px] shrink-0 px-3 xl:block">Lead</div>
            )}
            {displayProperties.targetDate && (
               <div className="hidden w-[92px] shrink-0 px-3 xl:block">Target date</div>
            )}
            {displayProperties.issues && (
               <div className="hidden w-[60px] shrink-0 px-3 xl:block">Issues</div>
            )}
            {displayProperties.status && <div className="w-[92px] shrink-0 px-3">Status</div>}
            <div className="w-12 shrink-0" />
         </div>

         {groups.map((group) => (
            <div key={group.id}>
               {grouping !== 'none' && (
                  <div className="sticky top-8 z-[9] flex h-9 items-center gap-2 border-b border-border/40 bg-muted px-3 text-[13px] font-medium">
                     {group.icon && <span>{group.icon}</span>}
                     {group.name}
                     <span className="text-xs text-muted-foreground">{group.projects.length}</span>
                  </div>
               )}
               {group.projects.map((project) => (
                  <ProjectLine key={project.id} project={project} showTeam={grouping === 'none'} />
               ))}
               {group.projects.length === 0 && (
                  <div className="h-12 border-b border-border/40 px-11 py-3 text-xs text-muted-foreground">
                     No projects
                  </div>
               )}
            </div>
         ))}
      </div>
   );
}
