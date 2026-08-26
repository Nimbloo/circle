'use client';

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
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuShortcut,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { TeamMenuItems, useTeamDelete } from '@/components/common/teams/team-menu-items';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Link2, MoreHorizontal } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function HeaderNav() {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const team = teams.find((t) => t.id === teamId) ?? teams[0];
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const doDelete = useTeamDelete(team ?? { id: '', name: '' } as never, () => setConfirmOpen(false));

   // teams vazio (store não hidratou / 0 times) → team undefined; guarda contra crash.
   if (!team) return <div className="w-full border-b h-10" />;

   const copyLink = () => {
      const url = `${window.location.origin}/${orgId}/team/${team.id}/overview`;
      void navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'));
   };
   const remove = async () => {
      if (busy) return;
      setBusy(true);
      await doDelete();
      setBusy(false);
   };

   return (
      <>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-2 min-w-0">
               <SidebarTrigger />
               <div className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0 text-xs">
                  {team.icon}
               </div>
               <span className="text-sm font-medium truncate">{team.name}</span>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <button
                        className="ml-1 inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
                        aria-label="Team options"
                     >
                        <MoreHorizontal className="size-3.5" />
                     </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-52 rounded-lg" align="start">
                     <TeamMenuItems
                        team={team}
                        primitives={{
                           Item: DropdownMenuItem,
                           Separator: DropdownMenuSeparator,
                           Shortcut: DropdownMenuShortcut,
                        }}
                        onRequestDelete={() => setConfirmOpen(true)}
                     />
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
            <button
               onClick={copyLink}
               className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
               aria-label="Copy team link"
            >
               <Link2 className="size-4" />
            </button>
         </div>

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
