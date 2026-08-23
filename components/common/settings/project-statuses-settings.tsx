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
import { ApiError } from '@/lib/api/errors';
import type { StatusCategory } from '@/mock-data/status';
import { useStatuses } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsShell } from './shared';

const CATEGORY_GROUPS: { label: string; categories: StatusCategory[] }[] = [
   { label: 'Backlog', categories: ['backlog', 'triage'] },
   { label: 'Planned', categories: ['unstarted'] },
   { label: 'In Progress', categories: ['started'] },
   { label: 'Completed', categories: ['completed'] },
   { label: 'Canceled', categories: ['canceled'] },
];

const ALL_CATEGORIES: StatusCategory[] = [
   'triage',
   'backlog',
   'unstarted',
   'started',
   'completed',
   'canceled',
];

interface EditStatus {
   id: string;
   name: string;
   color: string;
   category: string;
}

function StatusDialog({
   editing,
   defaultCategory,
   open,
   onOpenChange,
   onSaved,
}: {
   editing: EditStatus | null;
   defaultCategory: StatusCategory;
   open: boolean;
   onOpenChange: (v: boolean) => void;
   onSaved: () => void;
}) {
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');
   const [color, setColor] = useState('#6e7280');
   const [category, setCategory] = useState<string>(defaultCategory);

   useEffect(() => {
      if (open) {
         setName(editing?.name ?? '');
         setColor(editing?.color ?? '#6e7280');
         setCategory(editing?.category ?? defaultCategory);
      }
   }, [open, editing, defaultCategory]);

   const save = async () => {
      if (!name.trim() || busy) return;
      setBusy(true);
      try {
         if (editing) await api.statuses.update(editing.id, { name: name.trim(), color, category });
         else await api.statuses.create({ name: name.trim(), color, category });
         await useWorkspaceStore.getState().hydrate();
         onOpenChange(false);
         onSaved();
         toast.success(editing ? 'Status atualizado' : 'Status criado');
      } catch {
         toast.error('Não foi possível salvar o status');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{editing ? 'Editar status' : 'Novo status'}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="st-name">Nome</Label>
                  <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} />
               </div>
               <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="st-color">Cor</Label>
                     <input
                        id="st-color"
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="h-9 w-full rounded-md border bg-transparent"
                     />
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <Label>Categoria</Label>
                     <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {ALL_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                 {c}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               </div>
            </div>
            <DialogFooter>
               <Button size="sm" onClick={() => void save()} disabled={busy || !name.trim()}>
                  {editing ? 'Salvar' : 'Criar'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Workspace "Project statuses" — CRUD real do catálogo de status (compartilhado com issues). */
export default function ProjectStatusesSettings() {
   const statuses = useStatuses();
   const me = useWorkspaceStore((s) => s.me);
   const isAdmin = me?.admin ?? false;

   const [dialogOpen, setDialogOpen] = useState(false);
   const [editing, setEditing] = useState<EditStatus | null>(null);
   const [dialogCategory, setDialogCategory] = useState<StatusCategory>('backlog');
   const [toDelete, setToDelete] = useState<EditStatus | null>(null);
   const [deleteBusy, setDeleteBusy] = useState(false);

   const openCreate = (category: StatusCategory) => {
      setEditing(null);
      setDialogCategory(category);
      setDialogOpen(true);
   };
   const openEdit = (s: EditStatus) => {
      setEditing(s);
      setDialogOpen(true);
   };

   const confirmDelete = async () => {
      if (!toDelete || deleteBusy) return;
      setDeleteBusy(true);
      try {
         await api.statuses.remove(toDelete.id);
         await useWorkspaceStore.getState().hydrate();
         setToDelete(null);
         toast.success('Status excluído');
      } catch (e) {
         // 409 = status em uso (mensagem específica do backend)
         const msg =
            e instanceof ApiError && e.status === 409
               ? 'Status em uso — reatribua as issues/projetos antes de excluir.'
               : 'Não foi possível excluir o status';
         toast.error(msg);
      } finally {
         setDeleteBusy(false);
      }
   };

   return (
      <SettingsShell
         title="Project statuses"
         description="Os estágios que issues e projetos percorrem. Este catálogo é compartilhado — alterações valem para todo o workspace."
      >
         <div className="rounded-lg border bg-container overflow-hidden">
            {CATEGORY_GROUPS.map((group) => {
               const items = statuses.filter((s) => group.categories.includes(s.category));
               return (
                  <div key={group.label}>
                     <div className="flex items-center justify-between px-4 py-2 bg-accent/30 border-y first:border-t-0 border-border/50">
                        <span className="text-sm text-muted-foreground">{group.label}</span>
                        {isAdmin && (
                           <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              aria-label={`Adicionar status em ${group.label}`}
                              onClick={() => openCreate(group.categories[0])}
                           >
                              <Plus className="size-4" />
                           </Button>
                        )}
                     </div>
                     {items.length === 0 && (
                        <div className="px-4 py-3 text-xs text-muted-foreground">No statuses</div>
                     )}
                     {items.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                           <span
                              className="inline-block size-3 rounded-full shrink-0"
                              style={{ backgroundColor: s.color }}
                           />
                           <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{s.name}</div>
                              <div className="text-xs text-muted-foreground">{s.category}</div>
                           </div>
                           {isAdmin && (
                              <div className="flex items-center gap-1 shrink-0">
                                 <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    aria-label="Editar status"
                                    onClick={() =>
                                       openEdit({
                                          id: s.id,
                                          name: s.name,
                                          color: s.color,
                                          category: s.category,
                                       })
                                    }
                                 >
                                    <Pencil className="size-3.5" />
                                 </Button>
                                 <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7 text-destructive hover:text-destructive"
                                    aria-label="Excluir status"
                                    onClick={() =>
                                       setToDelete({
                                          id: s.id,
                                          name: s.name,
                                          color: s.color,
                                          category: s.category,
                                       })
                                    }
                                 >
                                    <Trash2 className="size-3.5" />
                                 </Button>
                              </div>
                           )}
                        </div>
                     ))}
                  </div>
               );
            })}
         </div>

         <StatusDialog
            editing={editing}
            defaultCategory={dialogCategory}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSaved={() => undefined}
         />

         <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Excluir status “{toDelete?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     Só é possível excluir status que não estejam em uso por nenhuma issue, projeto
                     ou template.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteBusy}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(e) => {
                        e.preventDefault();
                        void confirmDelete();
                     }}
                     disabled={deleteBusy}
                  >
                     Excluir
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </SettingsShell>
   );
}
