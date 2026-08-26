'use client';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useParams, useRouter } from 'next/navigation';
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
   Link as LinkIcon,
   Hash,
   GitBranch,
   Type,
   Bell,
   BellOff,
   Star,
   GitPullRequestArrow,
   Clock,
} from 'lucide-react';
import { api } from '@/lib/client';
import { useIssuesStore } from '@/store/issues-store';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useStatuses, usePriorities, useLabels } from '@/store/catalog-store';
import { toast } from 'sonner';

/**
 * Conjunto de primitivos de menu (Context OU Dropdown). Os componentes de
 * ContextMenu e DropdownMenu do shadcn compartilham a mesma API, então a MESMA
 * árvore de itens é renderizada nos dois — garantindo que o menu ⋯ "Issue
 * options" e o right-click na área de properties abram exatamente o mesmo menu.
 */
export interface MenuPrimitives {
   Group: React.ElementType;
   Item: React.ElementType;
   Separator: React.ElementType;
   Shortcut: React.ElementType;
   Sub: React.ElementType;
   SubTrigger: React.ElementType;
   SubContent: React.ElementType;
}

/** Branch name estilo Linear: `<user>/<identifier>-<kebab-title>`. */
export function branchName(userName: string | undefined, identifier: string, title: string): string {
   const kebab = (s: string) =>
      s
         .toLowerCase()
         .normalize('NFD')
         .replace(/[\u0300-\u036f]/g, '')
         .replace(/[^a-z0-9]+/g, '-')
         .replace(/^-+|-+$/g, '');
   const prefix = userName ? kebab(userName).split('-')[0] : 'me';
   const slug = kebab(title).slice(0, 40).replace(/-+$/g, '');
   return `${prefix}/${identifier.toLowerCase()}-${slug}`;
}

interface IssueMenuItemsProps {
   issueId?: string;
   primitives: MenuPrimitives;
   /** Chamado quando o usuário pede Delete — o wrapper abre o AlertDialog. */
   onRequestDelete: () => void;
}

/**
 * Itens do menu de ações de uma issue (status, assignee, priority, labels,
 * project, cycle, due date, mark as, copy link/id/branch/title, favorite,
 * subscribe, delete) — todos com backend real. Renderizado sob ContextMenu
 * (right-click nas properties) ou DropdownMenu (⋯), via `primitives`.
 */
export function IssueMenuItems({ issueId, primitives: P, onRequestDelete }: IssueMenuItemsProps) {
   const users = useWorkspaceStore((s) => s.users);
   const projects = useWorkspaceStore((s) => s.projects);
   const teams = useWorkspaceStore((s) => s.teams);
   const getCyclesByTeam = useWorkspaceStore((s) => s.getCyclesByTeam);
   const me = useWorkspaceStore((s) => s.me);
   const status = useStatuses();
   const priorities = usePriorities();
   const labels = useLabels();
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const statusCompleted = status.find((s) => s.category === 'completed');
   const statusCanceled = status.find((s) => s.category === 'canceled');

   const {
      updateIssueStatus,
      updateIssuePriority,
      updateIssueAssignee,
      addIssueLabel,
      removeIssueLabel,
      updateIssueProject,
      updateIssue,
      getIssueById,
      allIssues,
   } = useIssuesStore(
      useShallow((s) => ({
         updateIssueStatus: s.updateIssueStatus,
         updateIssuePriority: s.updateIssuePriority,
         updateIssueAssignee: s.updateIssueAssignee,
         addIssueLabel: s.addIssueLabel,
         removeIssueLabel: s.removeIssueLabel,
         updateIssueProject: s.updateIssueProject,
         updateIssue: s.updateIssue,
         getIssueById: s.getIssueById,
         allIssues: s.issues,
      }))
   );

   const issue = issueId ? getIssueById(issueId) : undefined;
   const teamCycles = issue?.teamId ? getCyclesByTeam(issue.teamId) : [];
   // Candidatos a "parent" (Convert to sub-issue): issues do mesmo time, exceto a própria.
   const parentCandidates = issue
      ? allIssues.filter((c) => c.teamId === issue.teamId && c.id !== issue.id).slice(0, 8)
      : [];

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
      const p = priorities.find((x) => x.id === priorityId);
      if (p) {
         updateIssuePriority(issueId, p);
         toast.success(`Priority updated to ${p.name}`);
      }
   };
   const handleAssigneeChange = (userId: string | null) => {
      if (!issueId) return;
      const a = userId ? users.find((u) => u.id === userId) || null : null;
      updateIssueAssignee(issueId, a);
      toast.success(a ? `Assigned to ${a.name}` : 'Unassigned');
   };
   const handleLabelToggle = (labelId: string) => {
      if (!issueId || !issue) return;
      const label = labels.find((l) => l.id === labelId);
      if (!label) return;
      if (issue.labels.some((l) => l.id === labelId)) {
         removeIssueLabel(issueId, labelId);
         toast.success(`Removed label: ${label.name}`);
      } else {
         addIssueLabel(issueId, label);
         toast.success(`Added label: ${label.name}`);
      }
   };
   const handleProjectChange = (projectId: string | null) => {
      if (!issueId) return;
      const p = projectId ? projects.find((x) => x.id === projectId) : undefined;
      updateIssueProject(issueId, p);
      toast.success(p ? `Project set to ${p.name}` : 'Project removed');
   };
   const handleCycleChange = (cycleId: string, label: string) => {
      if (!issueId) return;
      updateIssue(issueId, { cycleId });
      toast.success(cycleId ? `Cycle → ${label}` : 'Removido do cycle');
   };

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

   const copy = (text: string, msg: string) =>
      void navigator.clipboard.writeText(text).then(() => toast.success(msg));
   const copyLink = () => {
      if (issue)
         copy(
            `${window.location.origin}/${orgId ?? 'nimbloo'}/issue/${issue.identifier}`,
            'Link copiado'
         );
   };
   const copyId = () => issue && copy(issue.identifier, 'ID copiado');
   const copyBranch = () =>
      issue && copy(branchName(me?.name, issue.identifier, issue.title), 'Branch name copiado');
   const copyTitle = () => issue && copy(issue.title, 'Título copiado');

   const handleToggleFavorite = () => {
      if (!issueId) return;
      api.issues
         .toggleFavorite(issueId)
         .then((r) =>
            toast.success(r.favorited ? 'Adicionado aos favoritos' : 'Removido dos favoritos')
         )
         .catch(() => toast.error('Falha ao favoritar'));
   };
   const handleSubscribe = () => {
      if (!issueId) return;
      api.issues
         .subscribe(issueId)
         .then(() => toast.success('Você agora segue esta issue'))
         .catch(() => toast.error('Falha ao seguir'));
   };
   const handleUnsubscribe = () => {
      if (!issueId) return;
      api.issues
         .unsubscribe(issueId)
         .then(() => toast.success('Você não segue mais esta issue'))
         .catch(() => toast.error('Falha ao deixar de seguir'));
   };

   // Create related: cria uma issue nova no mesmo time, vincula como related e navega.
   const handleCreateRelated = async () => {
      if (!issue?.teamId) return;
      try {
         const created = await api.issues.create({
            teamId: issue.teamId,
            title: 'New related issue',
            statusId: issue.status.id,
            priorityId: issue.priority.id,
         });
         await api.issues.addRelation(issue.id, created.id, 'related');
         toast.success('Issue relacionada criada');
         router.push(`/${orgId ?? 'nimbloo'}/issue/${created.identifier}`);
      } catch {
         toast.error('Falha ao criar a issue relacionada');
      }
   };

   // Convert to sub-issue: torna ESTA issue filha de `parent` (addRelation kind=sub na
   // direção parent → esta).
   const handleConvertToSub = (parentId: string, parentIdentifier: string) => {
      if (!issueId) return;
      api.issues
         .addRelation(parentId, issueId, 'sub')
         .then(() => toast.success(`Agora é sub-issue de ${parentIdentifier}`))
         .catch(() => toast.error('Falha ao converter em sub-issue'));
   };

   // Move to team: reatribui o identifier a partir do time destino (ENG-11 → OUTRO-N).
   const handleMoveTeam = (targetTeamId: string, teamName: string) => {
      if (!issueId) return;
      api.issues
         .moveTeam(issueId, targetTeamId)
         .then(() => toast.success(`Movida para ${teamName}`))
         .catch(() => toast.error('Falha ao mover de time'));
   };

   // Remind: cria um lembrete (notificação adiada até o instante escolhido — reusa o
   // snoozedUntil: aparece no inbox quando a hora chega).
   const remindAt = (at: Date, label: string) => {
      if (!issueId) return;
      api.issues
         .remind(issueId, at.toISOString())
         .then(() => toast.success(`Lembrete: ${label}`))
         .catch(() => toast.error('Falha ao criar o lembrete'));
   };
   const remindPresets = () => {
      const base = new Date();
      const at = (h: number, addDays = 0) => {
         const d = new Date(base);
         d.setDate(d.getDate() + addDays);
         d.setHours(h, 0, 0, 0);
         return d;
      };
      const inHours = (n: number) => new Date(base.getTime() + n * 3600_000);
      return [
         { label: 'In 1 hour', at: inHours(1) },
         { label: 'In 3 hours', at: inHours(3) },
         { label: 'Tomorrow', at: at(9, 1) },
         { label: 'Next week', at: at(9, 7) },
      ];
   };

   return (
      <>
         <P.Group>
            <P.Sub>
               <P.SubTrigger>
                  <CircleCheck className="mr-2 size-4" /> Status
               </P.SubTrigger>
               <P.SubContent className="w-48">
                  {status.map((s) => {
                     const Icon = s.icon;
                     return (
                        <P.Item key={s.id} onClick={() => handleStatusChange(s.id)}>
                           <Icon /> {s.name}
                        </P.Item>
                     );
                  })}
               </P.SubContent>
            </P.Sub>

            <P.Sub>
               <P.SubTrigger>
                  <User className="mr-2 size-4" /> Assignee
               </P.SubTrigger>
               <P.SubContent className="w-48">
                  <P.Item onClick={() => handleAssigneeChange(null)}>
                     <User className="size-4" /> Unassigned
                  </P.Item>
                  {users.map((user) => (
                     <P.Item key={user.id} onClick={() => handleAssigneeChange(user.id)}>
                        <Avatar className="size-4">
                           <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
                           <AvatarFallback>{user.name[0]}</AvatarFallback>
                        </Avatar>
                        {user.name}
                     </P.Item>
                  ))}
               </P.SubContent>
            </P.Sub>

            <P.Sub>
               <P.SubTrigger>
                  <BarChart3 className="mr-2 size-4" /> Priority
               </P.SubTrigger>
               <P.SubContent className="w-48">
                  {priorities.map((priority) => (
                     <P.Item key={priority.id} onClick={() => handlePriorityChange(priority.id)}>
                        <priority.icon className="size-4" /> {priority.name}
                     </P.Item>
                  ))}
               </P.SubContent>
            </P.Sub>

            <P.Sub>
               <P.SubTrigger>
                  <Tag className="mr-2 size-4" /> Labels
               </P.SubTrigger>
               <P.SubContent className="w-48">
                  {labels.map((label) => (
                     <P.Item key={label.id} onClick={() => handleLabelToggle(label.id)}>
                        <span
                           className="inline-block size-3 rounded-full"
                           style={{ backgroundColor: label.color }}
                           aria-hidden="true"
                        />
                        {label.name}
                     </P.Item>
                  ))}
               </P.SubContent>
            </P.Sub>

            <P.Sub>
               <P.SubTrigger>
                  <Folder className="mr-2 size-4" /> Project
               </P.SubTrigger>
               <P.SubContent className="w-64">
                  <P.Item onClick={() => handleProjectChange(null)}>
                     <Folder className="size-4" /> No Project
                  </P.Item>
                  {projects.slice(0, 5).map((project) => (
                     <P.Item key={project.id} onClick={() => handleProjectChange(project.id)}>
                        <project.icon className="size-4" /> {project.name}
                     </P.Item>
                  ))}
               </P.SubContent>
            </P.Sub>

            <P.Sub>
               <P.SubTrigger>
                  <IterationCcw className="mr-2 size-4" /> Cycle
               </P.SubTrigger>
               <P.SubContent className="w-56">
                  <P.Item onClick={() => handleCycleChange('', '')}>
                     <IterationCcw className="size-4 text-muted-foreground" /> No cycle
                  </P.Item>
                  {teamCycles.map((cycle) => (
                     <P.Item key={cycle.id} onClick={() => handleCycleChange(cycle.id, cycle.name)}>
                        <IterationCcw className="size-4" /> {cycle.name}
                        {issue?.cycleId === cycle.id && <CheckCircle2 className="ml-auto size-3.5" />}
                     </P.Item>
                  ))}
                  {teamCycles.length === 0 && <P.Item disabled>Sem cycles no time</P.Item>}
               </P.SubContent>
            </P.Sub>

            <P.Sub>
               <P.SubTrigger>
                  <CalendarClock className="mr-2 size-4" /> Due date
               </P.SubTrigger>
               <P.SubContent className="w-44">
                  <P.Item onClick={() => setDueInDays(0, 'Today')}>Today</P.Item>
                  <P.Item onClick={() => setDueInDays(1, 'Tomorrow')}>Tomorrow</P.Item>
                  <P.Item onClick={() => setDueInDays(7, 'Next week')}>Next week</P.Item>
                  <P.Item onClick={clearDueDate}>No due date</P.Item>
               </P.SubContent>
            </P.Sub>
         </P.Group>

         <P.Separator />

         {(statusCompleted || statusCanceled) && (
            <P.Sub>
               <P.SubTrigger>
                  <CheckCircle2 className="mr-2 size-4" /> Mark as
               </P.SubTrigger>
               <P.SubContent className="w-48">
                  {statusCompleted && (
                     <P.Item onClick={() => handleMarkAs(statusCompleted)}>
                        <statusCompleted.icon /> {statusCompleted.name}
                     </P.Item>
                  )}
                  {statusCanceled && (
                     <P.Item onClick={() => handleMarkAs(statusCanceled)}>
                        <statusCanceled.icon /> {statusCanceled.name}
                     </P.Item>
                  )}
               </P.SubContent>
            </P.Sub>
         )}

         <P.Item onClick={copyLink}>
            <LinkIcon className="size-4" /> Copy issue link
         </P.Item>
         <P.Item onClick={copyId}>
            <Hash className="size-4" /> Copy issue ID
         </P.Item>
         <P.Item onClick={copyBranch}>
            <GitBranch className="size-4" /> Copy git branch name
         </P.Item>
         <P.Item onClick={copyTitle}>
            <Type className="size-4" /> Copy title
         </P.Item>

         <P.Separator />

         <P.Item onClick={() => void handleCreateRelated()}>
            <GitPullRequestArrow className="size-4" /> Create related issue
         </P.Item>
         {teams.length > 1 && (
            <P.Sub>
               <P.SubTrigger>
                  <User className="mr-2 size-4" /> Move to team
               </P.SubTrigger>
               <P.SubContent className="w-52">
                  {teams
                     .filter((t) => t.id !== issue?.teamId)
                     .map((t) => (
                        <P.Item key={t.id} onClick={() => handleMoveTeam(t.id, t.name)}>
                           <span>{t.icon ?? '📁'}</span>
                           <span className="truncate">{t.name}</span>
                        </P.Item>
                     ))}
               </P.SubContent>
            </P.Sub>
         )}
         {parentCandidates.length > 0 && (
            <P.Sub>
               <P.SubTrigger>
                  <IterationCcw className="mr-2 size-4" /> Convert to sub-issue of…
               </P.SubTrigger>
               <P.SubContent className="w-64">
                  {parentCandidates.map((p) => (
                     <P.Item key={p.id} onClick={() => handleConvertToSub(p.id, p.identifier)}>
                        <span className="text-muted-foreground shrink-0 text-xs">
                           {p.identifier}
                        </span>
                        <span className="truncate">{p.title}</span>
                     </P.Item>
                  ))}
               </P.SubContent>
            </P.Sub>
         )}
         <P.Sub>
            <P.SubTrigger>
               <Clock className="mr-2 size-4" /> Remind me
            </P.SubTrigger>
            <P.SubContent className="w-44">
               {remindPresets().map((p) => (
                  <P.Item key={p.label} onClick={() => remindAt(p.at, p.label)}>
                     {p.label}
                  </P.Item>
               ))}
            </P.SubContent>
         </P.Sub>

         <P.Separator />

         <P.Item onClick={handleToggleFavorite}>
            <Star className="size-4" /> Favorite
         </P.Item>
         <P.Item onClick={handleSubscribe}>
            <Bell className="size-4" /> Subscribe
         </P.Item>
         <P.Item onClick={handleUnsubscribe}>
            <BellOff className="size-4" /> Unsubscribe
         </P.Item>

         <P.Separator />

         <P.Item
            variant="destructive"
            onSelect={(e: Event) => {
               e.preventDefault();
               onRequestDelete();
            }}
         >
            <Trash2 className="size-4" /> Delete...
            <P.Shortcut>⌘⌫</P.Shortcut>
         </P.Item>
      </>
   );
}
