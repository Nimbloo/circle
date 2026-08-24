'use client';

import { Issue } from '@/data/issues';
import { Project } from '@/data/projects';
import { useIssuesStore } from '@/store/issues-store';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { api } from '@/lib/client';
import type { UpdateProjectInput } from '@/lib/api/projects';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { HealthPopover } from './health-popover';
import { PrioritySelector } from './priority-selector';
import { LeadSelector } from './lead-selector';
import { StatusWithPercent } from './status-with-percent';
import { DatePicker } from './date-picker';
import { ProjectContextMenu } from './project-context-menu';

interface ProjectLineProps {
   project: Project;
}

const countIssues = (issues: Issue[], projectId: string) =>
   issues.filter((issue) => issue.project?.id === projectId).length;

export default function ProjectLine({ project }: ProjectLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const issues = useIssuesStore((s) => s.issues);
   const { displayProperties } = useProjectsDisplayStore();
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   // Prefere a contagem calculada pelo backend (issueCount); cai pro cálculo
   // local só quando o DTO não a trouxe (ex: dados mock).
   const computed = useMemo(() => countIssues(issues, project.id), [issues, project.id]);
   const issueCount = project.issueCount ?? computed;

   // % de conclusão REAL derivado das issues do projeto (o campo project.percentComplete
   // é estático/0 e nenhuma UI o atualiza — mostrava 0% congelado para todo projeto).
   const percentComplete = useMemo(() => {
      const projectIssues = issues.filter((i) => i.project?.id === project.id);
      if (projectIssues.length === 0) return project.percentComplete;
      const done = projectIssues.filter((i) => i.status.category === 'completed').length;
      return Math.round((done / projectIssues.length) * 100);
   }, [issues, project.id, project.percentComplete]);

   const patchProject = async (patch: UpdateProjectInput, okMsg: string) => {
      try {
         await api.projects.update(project.id, patch);
         await hydrate();
         toast.success(okMsg);
      } catch {
         toast.error('Could not update the project');
      }
   };

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await api.projects.remove(project.id);
         await hydrate();
         toast.success('Project deleted');
         setConfirmOpen(false);
      } catch {
         toast.error('Could not delete the project');
      } finally {
         setBusy(false);
      }
   };

   return (
      <ProjectContextMenu project={project}>
         <div className="w-full flex items-center py-3 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm">
            <div className="flex-1 min-w-0 flex items-center gap-2">
               <div className="relative">
                  <div className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0">
                     <project.icon className="size-4" />
                  </div>
               </div>
               <div className="flex flex-col items-start overflow-hidden">
                  <Link
                     href={`/${orgId}/project/${project.id}/overview`}
                     className="font-medium truncate w-full hover:underline underline-offset-2"
                  >
                     {project.name}
                  </Link>
               </div>
               {displayProperties.labels &&
                  project.labels.map((label) => (
                     <span
                        key={label.id}
                        className="hidden lg:inline-flex items-center gap-1 text-[11px] border rounded-full px-1.5 py-px text-muted-foreground shrink-0"
                     >
                        <span
                           className="size-1.5 rounded-full"
                           style={{ backgroundColor: label.color }}
                        />
                        {label.name}
                     </span>
                  ))}
            </div>

            {displayProperties.health && (
               <div className="hidden sm:block w-[120px] shrink-0">
                  <HealthPopover
                     project={project}
                     onHealthChange={(healthId) => patchProject({ healthId }, 'Health updated')}
                  />
               </div>
            )}
            {displayProperties.priority && (
               <div className="hidden md:block w-[70px] shrink-0">
                  <PrioritySelector
                     priority={project.priority}
                     onPriorityChange={(priorityId) =>
                        patchProject({ priorityId }, 'Priority updated')
                     }
                  />
               </div>
            )}
            {displayProperties.lead && (
               <div className="hidden xl:block w-[130px] shrink-0">
                  <LeadSelector
                     lead={project.lead}
                     onLeadChange={(userId) => patchProject({ leadId: userId }, 'Lead updated')}
                  />
               </div>
            )}
            {displayProperties.targetDate && (
               <div className="hidden xl:block w-[110px] shrink-0">
                  <DatePicker
                     date={project.targetDate ? new Date(project.targetDate) : undefined}
                     onDateChange={(date) =>
                        patchProject(
                           { targetDate: date ? format(date, 'yyyy-MM-dd') : null },
                           'Target date updated'
                        )
                     }
                  />
               </div>
            )}
            {displayProperties.issues && (
               <div className="hidden xl:block w-[60px] shrink-0 text-muted-foreground text-xs pl-2.5">
                  {issueCount}
               </div>
            )}
            {displayProperties.status && (
               <div className="w-[90px] shrink-0">
                  <StatusWithPercent
                     status={project.status}
                     percentComplete={percentComplete}
                     onStatusChange={(statusId) => patchProject({ statusId }, 'Status updated')}
                  />
               </div>
            )}

            <div className="w-8 shrink-0 flex justify-end">
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label="Project actions"
                     >
                        <MoreHorizontal className="size-4 text-muted-foreground" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                     <DropdownMenuItem
                        variant="destructive"
                        onSelect={(e) => {
                           e.preventDefault();
                           setConfirmOpen(true);
                        }}
                     >
                        <Trash2 className="size-4" />
                        Delete project
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
               <AlertDialogContent>
                  <AlertDialogHeader>
                     <AlertDialogTitle>Delete project?</AlertDialogTitle>
                     <AlertDialogDescription>
                        This removes “{project.name}”. Its issues are kept but unassigned from the
                        project. This cannot be undone.
                     </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                     <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                     <AlertDialogAction
                        onClick={(e) => {
                           e.preventDefault();
                           void remove();
                        }}
                        disabled={busy}
                     >
                        Delete
                     </AlertDialogAction>
                  </AlertDialogFooter>
               </AlertDialogContent>
            </AlertDialog>
         </div>
      </ProjectContextMenu>
   );
}
