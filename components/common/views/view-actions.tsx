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
   DropdownMenuSub,
   DropdownMenuSubContent,
   DropdownMenuSubTrigger,
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
import { View } from '@/data/views';
import type { ViewFilter } from '@/lib/api/views';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useParams } from 'next/navigation';
import { Link2, MoreHorizontal, Pencil, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ViewFilterEditor } from './view-filter-editor';

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
   const applyView = useWorkspaceStore((s) => s.applyView);
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState(view.name);
   const [description, setDescription] = useState(view.description ?? '');
   const [filter, setFilter] = useState<ViewFilter>(view.filter ?? {});

   const save = async () => {
      if (!name.trim() || busy) return;
      setBusy(true);
      try {
         const dto = await api.views.update(view.id, {
            name: name.trim(),
            description: description.trim() || null,
            filter,
         });
         applyView(dto);
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
               <DialogTitle>Edit view</DialogTitle>
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
               <div className="flex flex-col gap-1.5">
                  <Label>Filters</Label>
                  <ViewFilterEditor type={view.type} filter={filter} onChange={setFilter} />
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
   const applyView = useWorkspaceStore((s) => s.applyView);
   const removeViewLocal = useWorkspaceStore((s) => s.removeViewLocal);
   const teams = useWorkspaceStore((s) => s.teams);
   const { orgId } = useParams<{ orgId: string }>();

   /**
    * Compartilhar = atribuir um time à view. O modelo já era esse (`teamId` nulo = só
    * o dono enxerga); faltava poder mudar depois de criada.
    */
   const share = async (teamId: string | null, msg: string) => {
      try {
         applyView(await api.views.update(view.id, { teamId }));
         toast.success(msg);
      } catch (e) {
         toast.error(errMsg(e, 'Não foi possível alterar o compartilhamento'));
      }
   };

   const copyLink = () => {
      const url = `${window.location.origin}/${orgId}/view/${view.id}`;
      void navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'));
   };
   const [editOpen, setEditOpen] = useState(false);
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await api.views.remove(view.id);
         removeViewLocal(view.id);
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
                  Edit
               </DropdownMenuItem>
               <DropdownMenuItem onSelect={copyLink}>
                  <Link2 className="size-4" />
                  Copiar link
               </DropdownMenuItem>

               {view.teamId ? (
                  <DropdownMenuItem onSelect={() => void share(null, 'View agora é pessoal')}>
                     <Users className="size-4" />
                     Tornar pessoal
                  </DropdownMenuItem>
               ) : (
                  <DropdownMenuSub>
                     <DropdownMenuSubTrigger>
                        <Users className="size-4" />
                        Compartilhar com time
                     </DropdownMenuSubTrigger>
                     <DropdownMenuSubContent className="w-48">
                        {teams.length === 0 ? (
                           <DropdownMenuItem disabled>Nenhum time</DropdownMenuItem>
                        ) : (
                           teams.map((t) => (
                              <DropdownMenuItem
                                 key={t.id}
                                 onSelect={() => void share(t.id, `Compartilhada com ${t.name}`)}
                              >
                                 {t.name}
                              </DropdownMenuItem>
                           ))
                        )}
                     </DropdownMenuSubContent>
                  </DropdownMenuSub>
               )}

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
