'use client';

import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { api, ApiError } from '@/lib/client';
import { View } from '@/mock-data/views';
import { useWorkspaceStore } from '@/store/workspace-store';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const errMsg = (e: unknown, fallback: string) =>
   e instanceof ApiError && e.message ? e.message : fallback;

function RenameViewDialog({
   view,
   open,
   onOpenChange,
}: {
   view: View;
   open: boolean;
   onOpenChange: (v: boolean) => void;
}) {
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState(view.name);
   const [description, setDescription] = useState(view.description ?? '');

   const save = async () => {
      if (!name.trim() || busy) return;
      setBusy(true);
      try {
         await api.views.update(view.id, {
            name: name.trim(),
            description: description.trim() || null,
         });
         await hydrate();
         onOpenChange(false);
         toast.success('View updated');
      } catch (e) {
         toast.error(errMsg(e, 'Could not update the view'));
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Rename view</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-view-name">Name</Label>
                  <Input
                     id="edit-view-name"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-view-desc">Description</Label>
                  <Input
                     id="edit-view-desc"
                     value={description}
                     onChange={(e) => setDescription(e.target.value)}
                  />
               </div>
            </div>
            <DialogFooter>
               <Button size="sm" onClick={() => void save()} disabled={busy || !name.trim()}>
                  Save changes
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Dropdown de ações (renomear / deletar) de uma saved view. */
export function ViewActions({ view }: { view: View }) {
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const [editOpen, setEditOpen] = useState(false);
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await api.views.remove(view.id);
         await hydrate();
         toast.success('View deleted');
         setConfirmOpen(false);
      } catch (e) {
         toast.error(errMsg(e, 'Could not delete the view'));
      } finally {
         setBusy(false);
      }
   };

   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button size="icon" variant="ghost" className="size-7" aria-label="View actions">
                  <MoreHorizontal className="size-4 text-muted-foreground" />
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
               <DropdownMenuItem
                  onSelect={(e) => {
                     e.preventDefault();
                     setEditOpen(true);
                  }}
               >
                  <Pencil className="size-4" />
                  Rename
               </DropdownMenuItem>
               <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                     e.preventDefault();
                     setConfirmOpen(true);
                  }}
               >
                  <Trash2 className="size-4" />
                  Delete
               </DropdownMenuItem>
            </DropdownMenuContent>
         </DropdownMenu>

         <RenameViewDialog view={view} open={editOpen} onOpenChange={setEditOpen} />

         <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete view?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This removes “{view.name}”. Only the owner (or an admin) can delete a view.
                     This cannot be undone.
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
