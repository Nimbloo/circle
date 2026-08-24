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
import { Textarea } from '@/components/ui/textarea';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
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
import { api } from '@/lib/client';
import { Initiative, INITIATIVE_STATUS_META, InitiativeStatus } from '@/data/initiatives';
import { usePriorities, useHealthStates } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const STATUS_IDS = Object.keys(INITIATIVE_STATUS_META) as InitiativeStatus[];

export function EditInitiativeDialog({
   initiative,
   open,
   onOpenChange,
}: {
   initiative: Initiative;
   open: boolean;
   onOpenChange: (v: boolean) => void;
}) {
   const applyInitiative = useWorkspaceStore((s) => s.applyInitiative);
   const priorities = usePriorities();
   const healthStates = useHealthStates();

   const [busy, setBusy] = useState(false);
   const [name, setName] = useState(initiative.name);
   const [description, setDescription] = useState(initiative.description ?? '');
   const [status, setStatus] = useState<InitiativeStatus>(initiative.status);
   const [priorityId, setPriorityId] = useState<string>(initiative.priority.id);
   const [healthId, setHealthId] = useState<string>(initiative.health.id);

   // Ressincroniza o form com a initiative atual ao (re)abrir — o useState inicial
   // só roda no mount, então sem isto reabrir após hydrate mostraria valores stale.
   useEffect(() => {
      if (open) {
         setName(initiative.name);
         setDescription(initiative.description ?? '');
         setStatus(initiative.status);
         setPriorityId(initiative.priority.id);
         setHealthId(initiative.health.id);
      }
   }, [open, initiative]);

   const save = async () => {
      if (!name.trim() || busy) return;
      setBusy(true);
      try {
         const dto = await api.initiatives.update(initiative.id, {
            name: name.trim(),
            description: description.trim() || null,
            status,
            priorityId,
            healthId,
         });
         applyInitiative(dto);
         onOpenChange(false);
         toast.success('Initiative updated');
      } catch {
         toast.error('Could not update the initiative');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Edit initiative</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-initiative-name">Name</Label>
                  <Input
                     id="edit-initiative-name"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-initiative-desc">Description</Label>
                  <Textarea
                     id="edit-initiative-desc"
                     value={description}
                     onChange={(e) => setDescription(e.target.value)}
                  />
               </div>
               <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1.5">
                     <Label>Status</Label>
                     <Select value={status} onValueChange={(v) => setStatus(v as InitiativeStatus)}>
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {STATUS_IDS.map((id) => (
                              <SelectItem key={id} value={id}>
                                 {INITIATIVE_STATUS_META[id].label}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <Label>Priority</Label>
                     <Select value={priorityId} onValueChange={setPriorityId}>
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {priorities.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                 {p.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <Label>Health</Label>
                     <Select value={healthId} onValueChange={setHealthId}>
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {healthStates.map((h) => (
                              <SelectItem key={h.id} value={h.id}>
                                 {h.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
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

/** Dropdown de ações (editar / deletar) de uma initiative. */
export function InitiativeActions({ initiative }: { initiative: Initiative }) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const removeInitiativeLocal = useWorkspaceStore((s) => s.removeInitiativeLocal);
   const [editOpen, setEditOpen] = useState(false);
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await api.initiatives.remove(initiative.id);
         removeInitiativeLocal(initiative.id);
         toast.success('Initiative deleted');
         setConfirmOpen(false);
         router.push(`/${orgId}/initiatives`);
      } catch {
         toast.error('Could not delete the initiative');
      } finally {
         setBusy(false);
      }
   };

   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="Initiative actions"
               >
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
