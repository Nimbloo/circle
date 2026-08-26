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
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';
import { IssueMenuItems, type MenuPrimitives } from './issue-menu-items';

const CONTEXT_PRIMITIVES: MenuPrimitives = {
   Group: ContextMenuGroup,
   Item: ContextMenuItem,
   Separator: ContextMenuSeparator,
   Shortcut: ContextMenuShortcut,
   Sub: ContextMenuSub,
   SubTrigger: ContextMenuSubTrigger,
   SubContent: ContextMenuSubContent,
};

interface IssueContextMenuProps {
   issueId?: string;
}

/**
 * Menu de right-click de uma issue (usado na área de PROPERTIES do detalhe do
 * inbox). Compartilha os itens com o ⋯ "Issue options" via `IssueMenuItems` —
 * são o MESMO menu. O AlertDialog de delete fica FORA do ContextMenuContent
 * (senão fecharia junto com o menu ao abrir).
 */
export function IssueContextMenu({ issueId }: IssueContextMenuProps) {
   const [confirmOpen, setConfirmOpen] = useState(false);
   const deleteIssue = useIssuesStore((s) => s.deleteIssue);

   const handleDelete = () => {
      if (!issueId) return;
      deleteIssue(issueId);
      toast.success('Issue deleted');
   };

   return (
      <>
         <ContextMenuContent className="w-64">
            <IssueMenuItems
               issueId={issueId}
               primitives={CONTEXT_PRIMITIVES}
               onRequestDelete={() => setConfirmOpen(true)}
            />
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
