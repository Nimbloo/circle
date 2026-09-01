'use client';

import { Project } from '@/data/projects';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { api } from '@/lib/client';
import type { UpdateProjectInput } from '@/lib/api/projects';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
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
   showTeam?: boolean;
}

export default function ProjectLine({ project, showTeam = false }: ProjectLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const displayProperties = useProjectsDisplayStore((s) => s.displayProperties);
   const team = useWorkspaceStore((state) =>
      showTeam ? state.teams.find((item) => item.id === project.teamId) : undefined
   );
   const applyProject = useWorkspaceStore((s) => s.applyProject);
   const removeProjectLocal = useWorkspaceStore((s) => s.removeProjectLocal);
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   // issueCount e percentComplete vêm PRONTOS do backend (assemble calcula ambos por
   // agregação SQL). Não assinamos mais o array de issues nem escaneamos por linha —
   // era O(P·N) a cada mutação de qualquer issue.
   const issueCount = project.issueCount ?? 0;
   const percentComplete = project.percentComplete;

   const patchProject = async (patch: UpdateProjectInput, okMsg: string) => {
      try {
         // Splice do DTO retornado — sem re-hidratar o workspace inteiro.
         const dto = await api.projects.update(project.id, patch);
         applyProject(dto);
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
         removeProjectLocal(project.id);
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
         <div className="group/project flex h-12 w-full items-center text-xs hover:bg-accent/40">
            <div className="w-[38px] shrink-0" />
            <div className="flex min-w-0 flex-1 items-center gap-3 px-1.5">
               <project.icon className="size-4 shrink-0" />
               <Link
                  href={`/${orgId}/project/${project.id}/overview`}
                  className="truncate text-[13px] font-medium leading-4 hover:underline hover:underline-offset-2"
               >
                  {project.name}
               </Link>
               {showTeam && team && (
                  <span className="hidden min-w-0 items-center gap-1 text-xs text-muted-foreground lg:inline-flex">
                     <span className="shrink-0">{team.icon}</span>
                     <span className="truncate">{team.name}</span>
                  </span>
               )}
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
               <div className="hidden w-[136px] shrink-0 px-3 sm:block">
                  <HealthPopover
                     project={project}
                     onHealthChange={(healthId) => patchProject({ healthId }, 'Health updated')}
                  />
               </div>
            )}
            {displayProperties.priority && (
               <div className="hidden w-[68px] shrink-0 px-3 md:block">
                  <PrioritySelector
                     priority={project.priority}
                     onPriorityChange={(priorityId) =>
                        patchProject({ priorityId }, 'Priority updated')
                     }
                  />
               </div>
            )}
            {displayProperties.lead && (
               <div className="hidden w-[132px] shrink-0 px-3 xl:block">
                  <LeadSelector
                     lead={project.lead}
                     onLeadChange={(userId) => patchProject({ leadId: userId }, 'Lead updated')}
                  />
               </div>
            )}
            {displayProperties.targetDate && (
               <div className="hidden w-[92px] shrink-0 px-3 xl:block">
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
               <div className="hidden w-[60px] shrink-0 px-3 text-xs text-muted-foreground xl:block">
                  {issueCount}
               </div>
            )}
            {displayProperties.status && (
               <div className="w-[92px] shrink-0 px-3">
                  <StatusWithPercent
                     status={project.status}
                     percentComplete={percentComplete}
                     onStatusChange={(statusId) => patchProject({ statusId }, 'Status updated')}
                  />
               </div>
            )}

            <div className="flex w-12 shrink-0 justify-center">
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 opacity-0 transition-opacity group-hover/project:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
