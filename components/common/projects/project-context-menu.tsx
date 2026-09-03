'use client';

import {
   ContextMenu,
   ContextMenuContent,
   ContextMenuItem,
   ContextMenuSeparator,
   ContextMenuShortcut,
   ContextMenuSub,
   ContextMenuSubContent,
   ContextMenuSubTrigger,
   ContextMenuTrigger,
} from '@/components/ui/context-menu';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { api } from '@/lib/client';
import type { UpdateProjectInput } from '@/lib/api/projects';
import { Project } from '@/data/projects';
import { usePriorities, useProjectStatuses, useHealthStates } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CheckIcon, Copy, Link2, Star, Target, Trash2, UserRound } from 'lucide-react';
import { useFavoritesStore } from '@/store/favorites-store';
import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';
import type { ComponentType, CSSProperties } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

/** Status/priority icons são uma união (Lucide | Remixicon); o cast expõe className/style. */
type IconCmp = ComponentType<{ className?: string; style?: CSSProperties }>;

/**
 * Context menu de botão direito de um project (padrão Linear): Status, Priority,
 * Health, Lead, Initiative (submenus), Copy link, Delete. Cada mudança persiste
 * via `api.projects.update` + aplica o DTO no workspace.
 */
export function ProjectContextMenu({
   project,
   children,
}: {
   project: Project;
   children: React.ReactNode;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const applyProject = useWorkspaceStore((s) => s.applyProject);
   const removeProjectLocal = useWorkspaceStore((s) => s.removeProjectLocal);
   const users = useWorkspaceStore((s) => s.users);
   const initiatives = useWorkspaceStore((s) => s.initiatives);
   const statuses = useProjectStatuses();
   const priorities = usePriorities();
   const healthStates = useHealthStates();
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const toggleFavorite = useFavoritesStore((s) => s.toggle);
   const isFav = useFavoritesStore((s) => s.isFavorite('project', project.id));

   const patch = async (body: UpdateProjectInput, msg: string) => {
      try {
         const dto = await api.projects.update(project.id, body);
         // `applyProject` também reconcilia o projectIds da initiative (vínculo relacional).
         applyProject(dto);
         toast.success(msg);
      } catch {
         toast.error('Could not update the project');
      }
   };

   const copyLink = () => {
      const url = `${window.location.origin}/${orgId}/project/${project.id}/overview`;
      void navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'));
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
      <>
         <ContextMenu>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-56">
               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     {(() => {
                        const Icon = project.status.icon as IconCmp;
                        return <Icon className="size-4" style={{ color: project.status.color }} />;
                     })()}
                     Status
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-52">
                     {statuses.map((s) => {
                        const Icon = s.icon as IconCmp;
                        return (
                           <ContextMenuItem
                              key={s.id}
                              onSelect={() => void patch({ statusId: s.id }, `Status → ${s.name}`)}
                           >
                              <Icon className="size-4" style={{ color: s.color }} />
                              {s.name}
                              {project.status.id === s.id && (
                                 <CheckIcon className="ml-auto size-3.5" />
                              )}
                           </ContextMenuItem>
                        );
                     })}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <project.priority.icon className="size-4" />
                     Priority
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                     {priorities.map((p) => (
                        <ContextMenuItem
                           key={p.id}
                           onSelect={() =>
                              void patch({ priorityId: p.id }, `Prioridade → ${p.name}`)
                           }
                        >
                           <p.icon className="size-4 text-muted-foreground" />
                           {p.name}
                           {project.priority.id === p.id && (
                              <CheckIcon className="ml-auto size-3.5" />
                           )}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: project.health.color }}
                     />
                     Health
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                     {healthStates.map((h) => (
                        <ContextMenuItem
                           key={h.id}
                           onSelect={() => void patch({ healthId: h.id }, `Health → ${h.name}`)}
                        >
                           <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: h.color }}
                           />
                           {h.name}
                           {project.health.id === h.id && (
                              <CheckIcon className="ml-auto size-3.5" />
                           )}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <UserRound className="size-4" />
                     Lead
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-56">
                     <ContextMenuItem
                        onSelect={() => void patch({ leadId: null }, 'Lead removido')}
                     >
                        <UserRound className="size-4 text-muted-foreground" />
                        No lead
                        {!project.lead && <CheckIcon className="ml-auto size-3.5" />}
                     </ContextMenuItem>
                     {users.map((u) => (
                        <ContextMenuItem
                           key={u.id}
                           onSelect={() => void patch({ leadId: u.id }, `Lead → ${u.name}`)}
                        >
                           <Avatar className="size-4">
                              <AvatarImage src={u.avatarUrl || undefined} alt={u.name} />
                              <AvatarFallback className="text-[8px]">{u.name[0]}</AvatarFallback>
                           </Avatar>
                           {u.name}
                           {project.lead?.id === u.id && <CheckIcon className="ml-auto size-3.5" />}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <Target className="size-4" />
                     Initiative
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-56">
                     <ContextMenuItem
                        onSelect={() => void patch({ initiativeId: null }, 'Initiative removida')}
                     >
                        <Target className="size-4 text-muted-foreground" />
                        No initiative
                        {!project.initiative && <CheckIcon className="ml-auto size-3.5" />}
                     </ContextMenuItem>
                     {initiatives.map((i) => (
                        <ContextMenuItem
                           key={i.id}
                           onSelect={() =>
                              void patch({ initiativeId: i.id }, `Initiative → ${i.name}`)
                           }
                        >
                           <span className="text-sm">{i.icon}</span>
                           {i.name}
                           {project.initiative === i.id && (
                              <CheckIcon className="ml-auto size-3.5" />
                           )}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSeparator />
               <ContextMenuItem onSelect={() => void toggleFavorite('project', project.id)}>
                  <Star className={cn('size-4', isFav && 'fill-amber-400 text-amber-400')} />
                  {isFav ? 'Remove from favorites' : 'Add to favorites'}
               </ContextMenuItem>
               <ContextMenuItem onSelect={copyLink}>
                  <Link2 className="size-4" />
                  Copy link
                  <ContextMenuShortcut>
                     <Copy className="size-3.5" />
                  </ContextMenuShortcut>
               </ContextMenuItem>
               <ContextMenuSeparator />
               <ContextMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
                  <Trash2 className="size-4" />
                  Delete
               </ContextMenuItem>
            </ContextMenuContent>
         </ContextMenu>

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
      </>
   );
}
