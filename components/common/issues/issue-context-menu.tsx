'use client';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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
import { buttonVariants } from '@/components/ui/button';
import {
   ContextMenuContent,
   ContextMenuGroup,
   ContextMenuItem,
   ContextMenuSeparator,
   ContextMenuShortcut,
   ContextMenuSub,
   ContextMenuSubContent,
   ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { useState } from 'react';
import {
   CircleCheck,
   User,
   BarChart3,
   Tag,
   Folder,
   CalendarClock,
   IterationCcw,
   Trash2,
   CheckCircle2,
   Clipboard,
} from 'lucide-react';
import { useIssuesStore } from '@/store/issues-store';
import { useParams } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useStatuses, usePriorities, useLabels } from '@/store/catalog-store';
import { toast } from 'sonner';

interface IssueContextMenuProps {
   issueId?: string;
}

export function IssueContextMenu({ issueId }: IssueContextMenuProps) {
   const users = useWorkspaceStore((s) => s.users);
   const projects = useWorkspaceStore((s) => s.projects);
   const getCyclesByTeam = useWorkspaceStore((s) => s.getCyclesByTeam);
   const status = useStatuses();
   const priorities = usePriorities();
   const labels = useLabels();
   const { orgId } = useParams<{ orgId: string }>();
   const statusCompleted = status.find((s) => s.category === 'completed');
   const statusCanceled = status.find((s) => s.category === 'canceled');
   // Triage (paridade Linear): Accept move p/ o 1º status "aberto" (unstarted/started);
   // Decline move p/ canceled. Só aparece quando a issue está na categoria triage.
   const statusAccept =
      status.find((s) => s.category === 'unstarted') ??
      status.find((s) => s.category === 'started');
   const [confirmOpen, setConfirmOpen] = useState(false);

   const {
      updateIssueStatus,
      updateIssuePriority,
      updateIssueAssignee,
      addIssueLabel,
      removeIssueLabel,
      updateIssueProject,
      updateIssue,
      deleteIssue,
      getIssueById,
   } = useIssuesStore(
      useShallow((s) => ({
         updateIssueStatus: s.updateIssueStatus,
         updateIssuePriority: s.updateIssuePriority,
         updateIssueAssignee: s.updateIssueAssignee,
         addIssueLabel: s.addIssueLabel,
         removeIssueLabel: s.removeIssueLabel,
         updateIssueProject: s.updateIssueProject,
         updateIssue: s.updateIssue,
         deleteIssue: s.deleteIssue,
         getIssueById: s.getIssueById,
      }))
   );

   const handleDelete = () => {
      if (!issueId) return;
      deleteIssue(issueId);
      toast.success('Issue deleted');
   };

   const handleStatusChange = (statusId: string) => {
      if (!issueId) return;
      const newStatus = status.find((s) => s.id === statusId);
      if (newStatus) {
         updateIssueStatus(issueId, newStatus);
         toast.success(`Status updated to ${newStatus.name}`);
      }
   };

   const handlePriorityChange = (priorityId: string) => {
      if (!issueId) return;
      const newPriority = priorities.find((p) => p.id === priorityId);
      if (newPriority) {
         updateIssuePriority(issueId, newPriority);
         toast.success(`Priority updated to ${newPriority.name}`);
      }
   };

   const handleAssigneeChange = (userId: string | null) => {
      if (!issueId) return;
      const newAssignee = userId ? users.find((u) => u.id === userId) || null : null;
      updateIssueAssignee(issueId, newAssignee);
      toast.success(newAssignee ? `Assigned to ${newAssignee.name}` : 'Unassigned');
   };

   const handleLabelToggle = (labelId: string) => {
      if (!issueId) return;
      const issue = getIssueById(issueId);
      const label = labels.find((l) => l.id === labelId);

      if (!issue || !label) return;

      const hasLabel = issue.labels.some((l) => l.id === labelId);

      if (hasLabel) {
         removeIssueLabel(issueId, labelId);
         toast.success(`Removed label: ${label.name}`);
      } else {
         addIssueLabel(issueId, label);
         toast.success(`Added label: ${label.name}`);
      }
   };

   const handleProjectChange = (projectId: string | null) => {
      if (!issueId) return;
      const newProject = projectId ? projects.find((p) => p.id === projectId) : undefined;
      updateIssueProject(issueId, newProject);
      toast.success(newProject ? `Project set to ${newProject.name}` : 'Project removed');
   };

   const handleCycleChange = (cycleId: string, label: string) => {
      if (!issueId) return;
      updateIssue(issueId, { cycleId });
      toast.success(cycleId ? `Cycle → ${label}` : 'Removido do cycle');
   };

   // Due date no formato YYYY-MM-DD (o que a rota exige: z.string().date()); mandar
   // toISOString() (datetime) tomava 400 e nunca persistia. Presets relativos ao dia
   // atual (padrão Linear), não offset fixo hardcoded.
   const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
         d.getDate()
      ).padStart(2, '0')}`;

   const setDueInDays = (days: number, label: string) => {
      if (!issueId) return;
      const d = new Date();
      d.setDate(d.getDate() + days);
      updateIssue(issueId, { dueDate: fmtDate(d) });
      toast.success(`Due date → ${label}`);
   };

   const clearDueDate = () => {
      if (!issueId) return;
      updateIssue(issueId, { dueDate: undefined });
      toast.success('Due date removida');
   };

   const handleMarkAs = (target?: (typeof status)[number]) => {
      if (!issueId || !target) return;
      updateIssueStatus(issueId, target);
      toast.success(`Marked as ${target.name}`);
   };

   // Snooze de triage: adia a issue por N dias (0 = remove). Some da fila de triage.
   const snoozeInDays = (days: number, label: string) => {
      if (!issueId) return;
      const until = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
      updateIssue(issueId, { snoozedUntil: until });
      toast.success(until ? `Adiada até ${label}` : 'Snooze removido');
   };

   const copyToClipboard = (text: string, msg: string) => {
      void navigator.clipboard.writeText(text).then(() => toast.success(msg));
   };

   const copyLink = () => {
      const issue = issueId ? getIssueById(issueId) : undefined;
      if (!issue) return;
      copyToClipboard(
         `${window.location.origin}/${orgId ?? 'nimbloo'}/issue/${issue.identifier}`,
         'Link copiado'
      );
   };

   const copyId = () => {
      const issue = issueId ? getIssueById(issueId) : undefined;
      if (issue) copyToClipboard(issue.identifier, 'ID copiado');
   };

   const copyTitle = () => {
      const issue = issueId ? getIssueById(issueId) : undefined;
      if (issue) copyToClipboard(issue.title, 'Título copiado');
   };

   // Cycles do time da issue (Linear lista os cycles do time da própria issue).
   const issue = issueId ? getIssueById(issueId) : undefined;
   const teamCycles = issue?.teamId ? getCyclesByTeam(issue.teamId) : [];

   return (
      <>
         <ContextMenuContent className="w-64">
            {/* Ações de Triage (só quando a issue está na fila de triage) */}
            {issue?.status.category === 'triage' && (
               <>
                  <ContextMenuGroup>
                     <ContextMenuItem
                        disabled={!statusAccept}
                        onClick={() => statusAccept && handleMarkAs(statusAccept)}
                     >
                        <CheckCircle2 className="size-4 text-green-500" /> Accept
                     </ContextMenuItem>
                     <ContextMenuItem
                        disabled={!statusCanceled}
                        onClick={() => statusCanceled && handleMarkAs(statusCanceled)}
                     >
                        <CircleCheck className="size-4 text-muted-foreground" /> Decline
                     </ContextMenuItem>
                     <ContextMenuSub>
                        <ContextMenuSubTrigger>
                           <CalendarClock className="mr-2 size-4" /> Snooze
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-44">
                           <ContextMenuItem onClick={() => snoozeInDays(1, 'amanhã')}>
                              Amanhã
                           </ContextMenuItem>
                           <ContextMenuItem onClick={() => snoozeInDays(7, 'próxima semana')}>
                              Próxima semana
                           </ContextMenuItem>
                           <ContextMenuItem onClick={() => snoozeInDays(0, '')}>
                              Remover snooze
                           </ContextMenuItem>
                        </ContextMenuSubContent>
                     </ContextMenuSub>
                  </ContextMenuGroup>
                  <ContextMenuSeparator />
               </>
            )}
            <ContextMenuGroup>
               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <CircleCheck className="mr-2 size-4" /> Status
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                     {status.map((s) => {
                        const Icon = s.icon;
                        return (
                           <ContextMenuItem key={s.id} onClick={() => handleStatusChange(s.id)}>
                              <Icon /> {s.name}
                           </ContextMenuItem>
                        );
                     })}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <User className="mr-2 size-4" /> Assignee
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                     <ContextMenuItem onClick={() => handleAssigneeChange(null)}>
                        <User className="size-4" /> Unassigned
                     </ContextMenuItem>
                     {users.map((user) => (
                        <ContextMenuItem
                           key={user.id}
                           onClick={() => handleAssigneeChange(user.id)}
                        >
                           <Avatar className="size-4">
                              <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
                              <AvatarFallback>{user.name[0]}</AvatarFallback>
                           </Avatar>
                           {user.name}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <BarChart3 className="mr-2 size-4" /> Priority
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                     {priorities.map((priority) => (
                        <ContextMenuItem
                           key={priority.id}
                           onClick={() => handlePriorityChange(priority.id)}
                        >
                           <priority.icon className="size-4" /> {priority.name}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <Tag className="mr-2 size-4" /> Labels
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                     {labels.map((label) => (
                        <ContextMenuItem key={label.id} onClick={() => handleLabelToggle(label.id)}>
                           <span
                              className="inline-block size-3 rounded-full"
                              style={{ backgroundColor: label.color }}
                              aria-hidden="true"
                           />
                           {label.name}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <Folder className="mr-2 size-4" /> Project
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-64">
                     <ContextMenuItem onClick={() => handleProjectChange(null)}>
                        <Folder className="size-4" /> No Project
                     </ContextMenuItem>
                     {projects.slice(0, 5).map((project) => (
                        <ContextMenuItem
                           key={project.id}
                           onClick={() => handleProjectChange(project.id)}
                        >
                           <project.icon className="size-4" /> {project.name}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <IterationCcw className="mr-2 size-4" /> Cycle
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-56">
                     <ContextMenuItem onClick={() => handleCycleChange('', '')}>
                        <IterationCcw className="size-4 text-muted-foreground" /> No cycle
                     </ContextMenuItem>
                     {teamCycles.map((cycle) => (
                        <ContextMenuItem
                           key={cycle.id}
                           onClick={() => handleCycleChange(cycle.id, cycle.name)}
                        >
                           <IterationCcw className="size-4" /> {cycle.name}
                           {issue?.cycleId === cycle.id && (
                              <CheckCircle2 className="ml-auto size-3.5" />
                           )}
                        </ContextMenuItem>
                     ))}
                     {teamCycles.length === 0 && (
                        <ContextMenuItem disabled>Sem cycles no time</ContextMenuItem>
                     )}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <CalendarClock className="mr-2 size-4" /> Due date
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-44">
                     <ContextMenuItem onClick={() => setDueInDays(0, 'Today')}>
                        Today
                     </ContextMenuItem>
                     <ContextMenuItem onClick={() => setDueInDays(1, 'Tomorrow')}>
                        Tomorrow
                     </ContextMenuItem>
                     <ContextMenuItem onClick={() => setDueInDays(7, 'Next week')}>
                        Next week
                     </ContextMenuItem>
                     <ContextMenuItem onClick={clearDueDate}>No due date</ContextMenuItem>
                  </ContextMenuSubContent>
               </ContextMenuSub>
            </ContextMenuGroup>

            <ContextMenuSeparator />

            {(statusCompleted || statusCanceled) && (
               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <CheckCircle2 className="mr-2 size-4" /> Mark as
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                     {statusCompleted && (
                        <ContextMenuItem onClick={() => handleMarkAs(statusCompleted)}>
                           <statusCompleted.icon /> {statusCompleted.name}
                        </ContextMenuItem>
                     )}
                     {statusCanceled && (
                        <ContextMenuItem onClick={() => handleMarkAs(statusCanceled)}>
                           <statusCanceled.icon /> {statusCanceled.name}
                        </ContextMenuItem>
                     )}
                  </ContextMenuSubContent>
               </ContextMenuSub>
            )}

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <Clipboard className="mr-2 size-4" /> Copy
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-44">
                  <ContextMenuItem onClick={copyLink}>Copy link</ContextMenuItem>
                  <ContextMenuItem onClick={copyId}>Copy ID</ContextMenuItem>
                  <ContextMenuItem onClick={copyTitle}>Copy title</ContextMenuItem>
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSeparator />

            <ContextMenuItem
               variant="destructive"
               onSelect={(e) => {
                  e.preventDefault();
                  setConfirmOpen(true);
               }}
            >
               <Trash2 className="size-4" /> Delete...
               <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
            </ContextMenuItem>
         </ContextMenuContent>

         <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete issue?</AlertDialogTitle>
                  <AlertDialogDescription>
                     Esta ação não pode ser desfeita. A issue será removida permanentemente.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     className={buttonVariants({ variant: 'destructive' })}
                     onClick={handleDelete}
                  >
                     Delete
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}
