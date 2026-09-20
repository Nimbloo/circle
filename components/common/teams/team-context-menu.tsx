'use client';

import {
   ContextMenu,
   ContextMenuContent,
   ContextMenuItem,
   ContextMenuSeparator,
   ContextMenuShortcut,
   ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { DeleteTeamDialog } from '@/components/common/teams/delete-team-dialog';
import { Team } from '@/data/teams';
import { Box, Copy, IterationCcw, Link2, ListTodo, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Context menu de botão direito de um team (padrão Linear): atalhos para as views
 * do time (Issues/Projects/Cycles), Copy link e Delete. A navegação usa o router;
 * o Delete abre o mesmo `DeleteTeamDialog` das settings (impacto + nome do time).
 */
export function TeamContextMenu({ team, children }: { team: Team; children: React.ReactNode }) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const [confirmOpen, setConfirmOpen] = useState(false);

   const go = (segment: string) => router.push(`/${orgId}/team/${team.id}/${segment}`);

   const copyLink = () => {
      const url = `${window.location.origin}/${orgId}/team/${team.id}/overview`;
      void navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'));
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

         <DeleteTeamDialog team={team} open={confirmOpen} onOpenChange={setConfirmOpen} />
      </>
   );
}
