'use client';

import { InsightsPanel } from '@/components/common/issues/insights-panel';
import { Issue } from '@/data/issues';
import { ProjectDetail } from '@/data/project-details';
import { Project } from '@/data/projects';
import { useRightPanelStore } from '@/store/right-panel-store';
import { Button } from '@/components/ui/button';
import {
   Sheet,
   SheetContent,
   SheetDescription,
   SheetHeader,
   SheetTitle,
   SheetTrigger,
} from '@/components/ui/sheet';
import { PanelRight } from 'lucide-react';
import { ProjectPropertiesPanel } from './project-properties-panel';

interface ProjectSidePanelProps {
   project: Project;
   detail: ProjectDetail;
   issues: Issue[];
   /** Issues shown by the insights panel (e.g. after filters); defaults to `issues`. */
   insightsIssues?: Issue[];
   /** Habilita a edição de milestones (add/complete/remove) no properties panel. */
   projectId?: string;
   /** Re-fetch do detalhe após uma mutação (milestones). Sem ele, o painel é read-only. */
   onChanged?: () => void | Promise<void>;
}

/**
 * Right panel of the project pages. Properties are shown by default;
 * the header icons switch to the insights panel or collapse it entirely
 * (right-panel-store: null = properties, 'insights', 'hidden').
 */
export function ProjectSidePanel({
   project,
   detail,
   issues,
   insightsIssues,
   projectId,
   onChanged,
}: ProjectSidePanelProps) {
   const { openPanel } = useRightPanelStore();

   return (
      <>
         <Sheet>
            <SheetTrigger asChild>
               <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-4 right-4 z-20 gap-1.5 shadow-sm xl:hidden"
               >
                  <PanelRight className="size-4" />
                  Properties
               </Button>
            </SheetTrigger>
            <SheetContent className="w-[92vw] overflow-y-auto p-0 pt-10 sm:max-w-[400px]">
               <SheetHeader className="sr-only">
                  <SheetTitle>Project properties</SheetTitle>
                  <SheetDescription>View and edit the properties of this project.</SheetDescription>
               </SheetHeader>
               <ProjectPropertiesPanel
                  project={project}
                  detail={detail}
                  issues={issues}
                  projectId={projectId}
                  onChanged={onChanged}
               />
            </SheetContent>
         </Sheet>

         {openPanel !== 'hidden' && (
            <aside className="hidden h-full w-[400px] shrink-0 overflow-hidden pl-1 xl:flex">
               {openPanel === 'insights' ? (
                  <InsightsPanel issues={insightsIssues ?? issues} />
               ) : (
                  <ProjectPropertiesPanel
                     project={project}
                     detail={detail}
                     issues={issues}
                     projectId={projectId}
                     onChanged={onChanged}
                  />
               )}
            </aside>
         )}
      </>
   );
}
