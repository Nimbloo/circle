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
import { Button, buttonVariants } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuShortcut,
   DropdownMenuSub,
   DropdownMenuSubContent,
   DropdownMenuSubTrigger,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';
import { IssueMenuItems, type MenuPrimitives } from './issue-menu-items';

const DROPDOWN_PRIMITIVES: MenuPrimitives = {
   Group: DropdownMenuGroup,
   Item: DropdownMenuItem,
   Separator: DropdownMenuSeparator,
   Shortcut: DropdownMenuShortcut,
   Sub: DropdownMenuSub,
   SubTrigger: DropdownMenuSubTrigger,
   SubContent: DropdownMenuSubContent,
};

interface IssueOptionsDropdownProps {
   issueId?: string;
   /** Trigger custom; default = botão ⋯ ghost. */
   children?: React.ReactNode;
}

/**
 * Botão ⋯ "Issue options" do header do detalhe. Abre EXATAMENTE o mesmo menu
 * que o right-click na área de properties (via `IssueMenuItems`).
 */
export function IssueOptionsDropdown({ issueId, children }: IssueOptionsDropdownProps) {
   const [confirmOpen, setConfirmOpen] = useState(false);
   const deleteIssue = useIssuesStore((s) => s.deleteIssue);

   const handleDelete = () => {
      if (!issueId) return;
      deleteIssue(issueId);
      toast.success('Issue deleted');
   };

   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               {children ?? (
                  <Button variant="ghost" size="icon" className="size-7" aria-label="Issue options">
                     <MoreHorizontal className="size-4" />
                  </Button>
               )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
               <IssueMenuItems
                  issueId={issueId}
                  primitives={DROPDOWN_PRIMITIVES}
                  onRequestDelete={() => setConfirmOpen(true)}
               />
            </DropdownMenuContent>
         </DropdownMenu>

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
