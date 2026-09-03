'use client';

import {
   ContextMenu,
   ContextMenuContent,
   ContextMenuItem,
   ContextMenuSeparator,
   ContextMenuShortcut,
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
import { api } from '@/lib/client';
import { Team } from '@/data/teams';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Box, Copy, IterationCcw, Link2, ListTodo, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Context menu de botão direito de um team (padrão Linear): atalhos para as views
 * do time (Issues/Projects/Cycles), Copy link e Delete. A navegação usa o router;
 * o Delete persiste via `api.teams.remove` (o backend rejeita com 409 se o time
 * ainda tiver issues/projects/cycles) + re-hidrata o workspace.
 */
export function TeamContextMenu({ team, children }: { team: Team; children: React.ReactNode }) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const removeTeamLocal = useWorkspaceStore((s) => s.removeTeamLocal);
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   const go = (segment: string) => router.push(`/${orgId}/team/${team.id}/${segment}`);

   const copyLink = () => {
      const url = `${window.location.origin}/${orgId}/team/${team.id}/overview`;
      void navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'));
   };

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await api.teams.remove(team.id);
         removeTeamLocal(team.id);
         toast.success('Team deleted');
         setConfirmOpen(false);
      } catch {
         toast.error('Não foi possível excluir o time (ainda tem issues/projects/cycles?)');
      } finally {
         setBusy(false);
      }
   };

   return (
      <>
         <ContextMenu>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-52">
               <ContextMenuItem onSelect={() => go('all')}>
                  <ListTodo className="size-4" />
                  Issues
               </ContextMenuItem>
               <ContextMenuItem onSelect={() => go('projects')}>
                  <Box className="size-4" />
                  Projects
               </ContextMenuItem>
               <ContextMenuItem onSelect={() => go('cycles')}>
                  <IterationCcw className="size-4" />
                  Cycles
               </ContextMenuItem>
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
                  Delete team
               </ContextMenuItem>
            </ContextMenuContent>
         </ContextMenu>

         <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete team?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This removes “{team.name}”. Only possible when the team has no issues, projects
                     or cycles. This cannot be undone.
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
