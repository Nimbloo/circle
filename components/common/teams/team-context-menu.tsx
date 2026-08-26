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
import { Team } from '@/data/teams';
import { useState } from 'react';
import { TeamMenuItems, useTeamDelete } from './team-menu-items';

/**
 * Context menu de botão direito de um team (padrão Linear): atalhos para as views
 * do time (Issues/Projects/Cycles/Members), Copy link e Delete. Os itens vêm do
 * componente compartilhado `TeamMenuItems` — os mesmos usados no ⋯ do sidebar e do
 * header do time. O Delete persiste via `api.teams.remove` (o backend rejeita com
 * 409 se o time ainda tiver issues/projects/cycles) + re-hidrata o workspace.
 */
export function TeamContextMenu({ team, children }: { team: Team; children: React.ReactNode }) {
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const doDelete = useTeamDelete(team, () => setConfirmOpen(false));

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      await doDelete();
      setBusy(false);
   };

   return (
      <>
         <ContextMenu>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-52">
               <TeamMenuItems
                  team={team}
                  primitives={{
                     Item: ContextMenuItem,
                     Separator: ContextMenuSeparator,
                     Shortcut: ContextMenuShortcut,
                  }}
                  onRequestDelete={() => setConfirmOpen(true)}
               />
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
