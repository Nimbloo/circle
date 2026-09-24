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
import { Cycle, CycleStatus, cycleStatusLabel } from '@/data/cycles';
import { useWorkspaceStore } from '@/store/workspace-store';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorReason } from '@/lib/error-reason';

const STATUS_IDS: CycleStatus[] = ['planned', 'upcoming', 'current', 'completed'];

function EditCycleDialog({
   cycle,
   open,
   onOpenChange,
}: {
   cycle: Cycle;
   open: boolean;
   onOpenChange: (v: boolean) => void;
}) {
   const applyCycle = useWorkspaceStore((s) => s.applyCycle);
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState(cycle.name);
   const [status, setStatus] = useState<CycleStatus>(cycle.status);
   const [startDate, setStartDate] = useState(cycle.startDate);
   const [endDate, setEndDate] = useState(cycle.endDate);
   const [capacity, setCapacity] = useState(String(cycle.capacity));

   // Semeia o form com o cycle atual SÓ na transição fechado→aberto (#38): um evento
   // remoto que troca o objeto `cycle` com o diálogo aberto não apaga o que foi digitado.
   const cycleRef = useRef(cycle);
   cycleRef.current = cycle;
   useEffect(() => {
      if (!open) return;
      const c = cycleRef.current;
      setName(c.name);
      setStatus(c.status);
      setStartDate(c.startDate);
      setEndDate(c.endDate);
      setCapacity(String(c.capacity));
   }, [open]);

   // Guarda por ref: vários Enter seguidos chegam antes do `busy` re-renderizar (pl#18).
   const savingRef = useRef(false);

   const save = async () => {
      if (!name.trim() || savingRef.current) return;
      if (startDate > endDate) {
         toast.error('Start date must be before end date');
         return;
      }
      // Campo vazio = não mexer na capacidade (antes virava 0 em silêncio).
      const typed = capacity.trim();
      const capacityValue = typed === '' ? undefined : Number(typed);
      if (
         capacityValue !== undefined &&
         (!Number.isInteger(capacityValue) || capacityValue < 0 || capacityValue > 1000)
      ) {
         toast.error('Capacity must be a whole number of 0 or more');
         return;
      }
      savingRef.current = true;
      setBusy(true);
      try {
         const dto = await api.cycles.update(cycle.id, {
            name: name.trim(),
            status,
            startDate,
            endDate,
            ...(capacityValue === undefined ? {} : { capacity: capacityValue }),
         });
         applyCycle(dto);
         onOpenChange(false);
         toast.success('Cycle updated');
      } catch (e) {
         // 409 (outro ciclo em andamento, #35) traz a explicação do servidor.
         toast.error(errorReason(e, 'Could not update the cycle'));
      } finally {
         savingRef.current = false;
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Edit cycle</DialogTitle>
            </DialogHeader>
            <form
               id="edit-cycle-form"
               className="flex flex-col gap-3"
               onSubmit={(e) => {
                  e.preventDefault();
                  void save();
               }}
            >
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-cycle-name">Name</Label>
                  <Input
                     id="edit-cycle-name"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                  />
               </div>
               <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                     <Label>Status</Label>
                     <Select value={status} onValueChange={(v) => setStatus(v as CycleStatus)}>
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {STATUS_IDS.map((id) => (
                              <SelectItem key={id} value={id}>
                                 {cycleStatusLabel[id]}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="edit-cycle-capacity">Capacity (%)</Label>
                     {/* Sem `min`/`step` no HTML: a recusa é nossa, com mensagem
                         legível, em vez do balão nativo do navegador (pl#18). */}
                     <Input
                        id="edit-cycle-capacity"
                        type="number"
                        inputMode="numeric"
                        value={capacity}
                        onChange={(e) => setCapacity(e.target.value)}
                     />
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="edit-cycle-start">Start date</Label>
                     <Input
                        id="edit-cycle-start"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                     />
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="edit-cycle-end">End date</Label>
                     <Input
                        id="edit-cycle-end"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                     />
                  </div>
               </div>
            </form>
            <DialogFooter>
               <Button
                  type="submit"
                  form="edit-cycle-form"
                  size="sm"
                  disabled={busy || !name.trim()}
               >
                  Save changes
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Dropdown de ações (editar / deletar) de um cycle. */
export function CycleActions({ cycle }: { cycle: Cycle }) {
   const removeCycleLocal = useWorkspaceStore((s) => s.removeCycleLocal);
   const [editOpen, setEditOpen] = useState(false);
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await api.cycles.remove(cycle.id);
         removeCycleLocal(cycle.id);
         toast.success('Cycle deleted');
         setConfirmOpen(false);
      } catch {
         toast.error('Could not delete the cycle');
      } finally {
         setBusy(false);
      }
   };

   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button size="icon" variant="ghost" className="size-7" aria-label="Cycle actions">
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

         <EditCycleDialog cycle={cycle} open={editOpen} onOpenChange={setEditOpen} />

         <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete cycle?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This removes “{cycle.name}”. Its issues are kept but detached from the cycle.
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
