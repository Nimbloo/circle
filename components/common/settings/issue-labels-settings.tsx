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
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/client';
import type { LabelInterface } from '@/data/labels';
import { useLabels } from '@/store/catalog-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Pencil, Pipette, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

/** Paleta pronta (clicável) + picker nativo p/ cor custom. */
const PRESET_COLORS = [
   '#e5484d',
   '#f76b15',
   '#ffb224',
   '#46a758',
   '#12a594',
   '#0091ff',
   '#6771c5',
   '#8e4ec6',
   '#e93d82',
   '#8b8d98',
];

const formatCount = (count: number) =>
   count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);

/** Dialog de criar/editar label (nome + cor). Sem id: o backend deriva do slug. */
function LabelDialog({
   open,
   onOpenChange,
   initial,
   onSubmit,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   initial: LabelInterface | null;
   onSubmit: (name: string, color: string) => Promise<void>;
}) {
   const [name, setName] = useState(initial?.name ?? '');
   const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[6]);
   const [busy, setBusy] = useState(false);

   // Re-semeia os campos sempre que o dialog (re)abre para um alvo diferente.
   const [seededFor, setSeededFor] = useState<string | null>(null);
   const seedKey = `${open}:${initial?.id ?? 'new'}`;
   if (open && seededFor !== seedKey) {
      setName(initial?.name ?? '');
      setColor(initial?.color ?? PRESET_COLORS[6]);
      setSeededFor(seedKey);
   } else if (!open && seededFor !== null) {
      setSeededFor(null);
   }

   const submit = async () => {
      const trimmed = name.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      try {
         await onSubmit(trimmed, color);
         onOpenChange(false);
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
         <DialogContent className="sm:max-w-sm">
            <DialogHeader>
               <DialogTitle>{initial ? 'Edit label' : 'New label'}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-1">
               <div className="flex items-center gap-2.5">
                  <span
                     className="size-4 rounded-full border shrink-0"
                     style={{ backgroundColor: color }}
                  />
                  <Input
                     autoFocus
                     placeholder="Label name"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void submit();
                     }}
                     className="h-8"
                  />
               </div>
               <div className="flex flex-wrap items-center gap-2">
                  {PRESET_COLORS.map((preset) => (
                     <button
                        key={preset}
                        type="button"
                        aria-label={`Use color ${preset}`}
                        onClick={() => setColor(preset)}
                        className="size-6 rounded-full border transition-transform hover:scale-110"
                        style={{
                           backgroundColor: preset,
                           outline:
                              color.toLowerCase() === preset.toLowerCase()
                                 ? '2px solid var(--ring)'
                                 : undefined,
                           outlineOffset: 2,
                        }}
                     />
                  ))}
                  <label
                     className="relative size-6 rounded-full border inline-flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground"
                     aria-label="Custom color"
                  >
                     <Pipette className="size-3.5" />
                     <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                     />
                  </label>
               </div>
            </div>
            <DialogFooter>
               <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
               >
                  Cancel
               </Button>
               <Button size="sm" onClick={() => void submit()} disabled={busy || !name.trim()}>
                  {busy ? 'Saving…' : initial ? 'Save' : 'Create label'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Workspace "Issue labels" settings: tabela filtrável com CRUD real (api.labels.*). */
export default function IssueLabelsSettings() {
   const [query, setQuery] = useState('');
   const issues = useIssuesStore((s) => s.issues);
   const labels = useLabels();
   const refresh = () => useWorkspaceStore.getState().hydrate();

   const [dialogOpen, setDialogOpen] = useState(false);
   const [editing, setEditing] = useState<LabelInterface | null>(null);
   const [deleting, setDeleting] = useState<LabelInterface | null>(null);
   const [deleteBusy, setDeleteBusy] = useState(false);

   const rows = useMemo(() => {
      const counts = new Map<string, number>();
      for (const issue of issues) {
         for (const label of issue.labels) {
            counts.set(label.id, (counts.get(label.id) ?? 0) + 1);
         }
      }
      return labels
         .map((label) => ({ ...label, issues: counts.get(label.id) ?? 0 }))
         .filter((label) => label.name.toLowerCase().includes(query.toLowerCase()))
         .sort((a, b) => a.name.localeCompare(b.name));
   }, [query, issues, labels]);

   const openCreate = () => {
      setEditing(null);
      setDialogOpen(true);
   };
   const openEdit = (label: LabelInterface) => {
      setEditing(label);
      setDialogOpen(true);
   };

   const submitLabel = async (name: string, color: string) => {
      try {
         if (editing) {
            await api.labels.update(editing.id, { name, color });
            toast.success(`Label "${name}" updated`);
         } else {
            await api.labels.create({ name, color });
            toast.success(`Label "${name}" created`);
         }
         await refresh();
      } catch (err) {
         const msg =
            err instanceof ApiError && err.status === 409
               ? 'A label with that name already exists'
               : editing
                 ? 'Could not update the label'
                 : 'Could not create the label';
         toast.error(msg);
         throw err; // mantém o dialog aberto p/ correção
      }
   };

   const confirmDelete = async () => {
      if (!deleting || deleteBusy) return;
      setDeleteBusy(true);
      try {
         await api.labels.remove(deleting.id);
         await refresh();
         toast.success(`Label "${deleting.name}" deleted`);
         setDeleting(null);
      } catch {
         toast.error('Could not delete the label');
      } finally {
         setDeleteBusy(false);
      }
   };

   return (
      <div className="h-full w-full overflow-y-auto">
         <div className="px-14 py-16 pb-20 max-md:px-5 max-md:py-8">
            <h1 className="mb-[13px] text-2xl font-medium leading-8">Issue labels</h1>

            <div className="mb-6 flex items-center justify-between gap-3">
               <Input
                  placeholder="Filter by name..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-8 w-[300px] max-w-full"
               />
               <Button onClick={openCreate}>New label</Button>
            </div>

            {/* Header */}
            <div className="flex items-center px-2 py-1.5 text-xs text-muted-foreground border-b">
               <div className="flex-1 min-w-0">Name ↓</div>
               <div className="w-[80px]">Issues</div>
               <div className="w-[72px] text-right">Actions</div>
            </div>

            {rows.map((label) => (
               <div
                  key={label.id}
                  className="group flex items-center px-2 py-2.5 text-sm border-b border-muted-foreground/5 hover:bg-sidebar/50"
               >
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                     <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: label.color }}
                     />
                     <span className="truncate">{label.name}</span>
                  </div>
                  <div className="w-[80px] text-xs text-muted-foreground">
                     {label.issues > 0 && formatCount(label.issues)}
                  </div>
                  <div className="w-[72px] flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`Edit ${label.name}`}
                        onClick={() => openEdit(label)}
                     >
                        <Pencil className="size-3.5" />
                     </Button>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${label.name}`}
                        onClick={() => setDeleting(label)}
                     >
                        <Trash2 className="size-3.5" />
                     </Button>
                  </div>
               </div>
            ))}
            {rows.length === 0 && (
               <p className="text-sm text-muted-foreground py-6">
                  {query ? 'No labels match your filter.' : 'No labels yet. Create your first one.'}
               </p>
            )}
         </div>

         <LabelDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            initial={editing}
            onSubmit={submitLabel}
         />

         <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete label “{deleting?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This removes the label from every issue and project it is applied to. This
                     action cannot be undone.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(e) => {
                        e.preventDefault();
                        void confirmDelete();
                     }}
                     disabled={deleteBusy}
                     className="bg-destructive text-white hover:bg-destructive/90"
                  >
                     {deleteBusy ? 'Deleting…' : 'Delete'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}
