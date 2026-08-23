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
import { Initiative, INITIATIVE_STATUS_META, InitiativeStatus } from '@/data/initiatives';
import { usePriorities } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CheckIcon, Copy, Link2, Pencil, Trash2, UserRound } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { EditInitiativeDialog } from './initiative-actions';
import { InitiativeStatusIcon } from './initiative-status-icon';

const STATUS_IDS = Object.keys(INITIATIVE_STATUS_META) as InitiativeStatus[];

/**
 * Context menu de botão direito de uma initiative (padrão Linear): Edit, Status,
 * Priority, Owner (submenus), Copy link, Delete. Cada mudança persiste via
 * `api.initiatives.update` + re-hidrata o workspace.
 */
export function InitiativeContextMenu({
   initiative,
   children,
}: {
   initiative: Initiative;
   children: React.ReactNode;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const users = useWorkspaceStore((s) => s.users);
   const priorities = usePriorities();
   const [editOpen, setEditOpen] = useState(false);
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   const patch = async (body: Parameters<typeof api.initiatives.update>[1], msg: string) => {
      try {
         await api.initiatives.update(initiative.id, body);
         await hydrate();
         toast.success(msg);
      } catch {
         toast.error('Não foi possível atualizar a initiative');
      }
   };

   const copyLink = () => {
      const url = `${window.location.origin}/${orgId}/initiative/${initiative.id}`;
      void navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'));
   };

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await api.initiatives.remove(initiative.id);
         await hydrate();
         toast.success('Initiative deleted');
         setConfirmOpen(false);
      } catch {
         toast.error('Could not delete the initiative');
      } finally {
         setBusy(false);
      }
   };

   return (
      <>
         <ContextMenu>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-56">
               <ContextMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  Edit
               </ContextMenuItem>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <InitiativeStatusIcon status={initiative.status} />
                     Status
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                     {STATUS_IDS.map((s) => (
                        <ContextMenuItem
                           key={s}
                           onSelect={() =>
                              void patch(
                                 { status: s },
                                 `Status → ${INITIATIVE_STATUS_META[s].label}`
                              )
                           }
                        >
                           <InitiativeStatusIcon status={s} />
                           {INITIATIVE_STATUS_META[s].label}
                           {initiative.status === s && <CheckIcon className="ml-auto size-3.5" />}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <initiative.priority.icon className="size-4" />
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
                           {initiative.priority.id === p.id && (
                              <CheckIcon className="ml-auto size-3.5" />
                           )}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSub>
                  <ContextMenuSubTrigger>
                     <UserRound className="size-4" />
                     Owner
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-56">
                     <ContextMenuItem
                        onSelect={() => void patch({ ownerId: null }, 'Owner removido')}
                     >
                        <UserRound className="size-4 text-muted-foreground" />
                        No owner
                        {!initiative.owner && <CheckIcon className="ml-auto size-3.5" />}
                     </ContextMenuItem>
                     {users.map((u) => (
                        <ContextMenuItem
                           key={u.id}
                           onSelect={() => void patch({ ownerId: u.id }, `Owner → ${u.name}`)}
                        >
                           <Avatar className="size-4">
                              <AvatarImage src={u.avatarUrl || undefined} alt={u.name} />
                              <AvatarFallback className="text-[8px]">{u.name[0]}</AvatarFallback>
                           </Avatar>
                           {u.name}
                           {initiative.owner?.id === u.id && (
                              <CheckIcon className="ml-auto size-3.5" />
                           )}
                        </ContextMenuItem>
                     ))}
                  </ContextMenuSubContent>
               </ContextMenuSub>

               <ContextMenuSeparator />
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

         <EditInitiativeDialog initiative={initiative} open={editOpen} onOpenChange={setEditOpen} />

         <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete initiative?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This removes “{initiative.name}”. Linked projects are kept but detached from
                     the initiative. This cannot be undone.
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
