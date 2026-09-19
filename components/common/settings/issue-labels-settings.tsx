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
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/client';
import { errorReason } from '@/lib/error-reason';
import type { LabelInterface } from '@/data/labels';
import type { LabelGroupDto } from '@/lib/api/labels';
import { useCatalogStore, useLabelGroups, useLabels } from '@/store/catalog-store';
import { useIssuesStore } from '@/store/issues-store';
import { ChevronRight, Pencil, Pipette, Plus, Tag, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingArea } from '@/components/common/loading-area';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { labelColor } from '@/components/common/palette';
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsShell } from './shared';

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

/** Valor sentinela do Select de grupo — Radix não aceita `value=""`. */
const NO_GROUP = '__none__';

const formatCount = (count: number) =>
   count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);

function ColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
   return (
      <div className="flex flex-wrap items-center gap-2">
         {PRESET_COLORS.map((preset) => (
            <button
               key={preset}
               type="button"
               aria-label={`Use color ${preset}`}
               onClick={() => onChange(preset)}
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
            className="relative inline-flex size-6 cursor-pointer items-center justify-center rounded-full border text-muted-foreground hover:text-foreground"
            aria-label="Custom color"
         >
            <Pipette className="size-3.5" />
            <input
               type="color"
               value={color.startsWith('#') ? color : PRESET_COLORS[6]}
               onChange={(e) => onChange(e.target.value)}
               className="absolute inset-0 cursor-pointer opacity-0"
            />
         </label>
      </div>
   );
}

/**
 * Dialog de criar/editar label (nome, cor e grupo). Sem id: o backend deriva do slug.
 * `onSubmit` já avisa o erro (toast) e rejeita para manter o dialog aberto; a rejeição
 * morre aqui (antes vazava como unhandled rejection — ad#10).
 */
function LabelDialog({
   open,
   onOpenChange,
   initial,
   defaultGroupId,
   groups,
   onSubmit,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   initial: LabelInterface | null;
   defaultGroupId: string | null;
   groups: LabelGroupDto[];
   onSubmit: (name: string, color: string, groupId: string | null) => Promise<void>;
}) {
   const [name, setName] = useState('');
   const [color, setColor] = useState(PRESET_COLORS[6]);
   const [groupId, setGroupId] = useState<string | null>(null);
   const [busy, setBusy] = useState(false);

   // Re-semeia os campos sempre que o dialog (re)abre para um alvo diferente.
   const [seededFor, setSeededFor] = useState<string | null>(null);
   const seedKey = `${open}:${initial?.id ?? 'new'}:${defaultGroupId ?? ''}`;
   if (open && seededFor !== seedKey) {
      setName(initial?.name ?? '');
      setColor(initial?.color ?? PRESET_COLORS[6]);
      setGroupId(initial ? (initial.groupId ?? null) : defaultGroupId);
      setSeededFor(seedKey);
   } else if (!open && seededFor !== null) {
      setSeededFor(null);
   }

   const submit = async () => {
      const trimmed = name.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      try {
         await onSubmit(trimmed, color, groupId);
         onOpenChange(false);
      } catch {
         // O toast com o motivo já saiu em `onSubmit`; o dialog fica aberto para correção.
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
                     className="size-4 shrink-0 rounded-full border"
                     style={{ backgroundColor: labelColor(color) }}
                  />
                  <Input
                     autoFocus
                     placeholder="Label name"
                     value={name}
                     maxLength={128}
                     onChange={(e) => setName(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void submit();
                     }}
                     className="h-8"
                  />
               </div>
               <ColorPicker color={color} onChange={setColor} />
               {groups.length > 0 && (
                  <div className="flex items-center justify-between gap-3">
                     <span className="text-[13px] text-muted-foreground">Group</span>
                     <Select
                        value={groupId ?? NO_GROUP}
                        onValueChange={(v) => setGroupId(v === NO_GROUP ? null : v)}
                     >
                        <SelectTrigger aria-label="Label group" className="h-8 w-44 text-[13px]">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value={NO_GROUP} className="text-[13px]">
                              No group
                           </SelectItem>
                           {groups.map((g) => (
                              <SelectItem key={g.id} value={g.id} className="text-[13px]">
                                 {g.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               )}
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

/** Dialog de criar/renomear grupo de labels. */
function GroupDialog({
   open,
   onOpenChange,
   initial,
   onSubmit,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   initial: LabelGroupDto | null;
   onSubmit: (name: string) => Promise<void>;
}) {
   const [name, setName] = useState('');
   const [busy, setBusy] = useState(false);
   const [seededFor, setSeededFor] = useState<string | null>(null);
   const seedKey = `${open}:${initial?.id ?? 'new'}`;
   if (open && seededFor !== seedKey) {
      setName(initial?.name ?? '');
      setSeededFor(seedKey);
   } else if (!open && seededFor !== null) {
      setSeededFor(null);
   }

   const submit = async () => {
      const trimmed = name.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      try {
         await onSubmit(trimmed);
         onOpenChange(false);
      } catch {
         // toast já emitido; mantém aberto
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
         <DialogContent className="sm:max-w-sm">
            <DialogHeader>
               <DialogTitle>{initial ? 'Rename group' : 'New label group'}</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground">
               An issue can have only one label from each group.
            </p>
            <Input
               autoFocus
               placeholder="Group name"
               value={name}
               maxLength={128}
               onChange={(e) => setName(e.target.value)}
               onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
               }}
               className="h-8"
            />
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
                  {busy ? 'Saving…' : initial ? 'Save' : 'Create group'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

type LabelRowData = LabelInterface & { issues: number };

function RowActions({ children }: { children: React.ReactNode }) {
   return (
      <div className="flex w-[84px] shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 max-md:opacity-100">
         {children}
      </div>
   );
}

function LabelRow({
   label,
   nested,
   onEdit,
   onDelete,
}: {
   label: LabelRowData;
   nested?: boolean;
   onEdit: () => void;
   onDelete: () => void;
}) {
   return (
      <div
         className={cn(
            'group/row flex h-11 items-center gap-2.5 px-4 text-[13px] hover:bg-accent/40',
            nested && 'pl-10'
         )}
      >
         <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: labelColor(label.color) }}
         />
         <span className="min-w-0 flex-1 truncate">{label.name}</span>
         <span className="w-[56px] shrink-0 text-right text-xs text-muted-foreground">
            {label.issues > 0 && formatCount(label.issues)}
         </span>
         <RowActions>
            <Button
               size="icon"
               variant="ghost"
               className="size-7"
               aria-label={`Edit ${label.name}`}
               onClick={onEdit}
            >
               <Pencil className="size-3.5" />
            </Button>
            <Button
               size="icon"
               variant="ghost"
               className="size-7 text-muted-foreground hover:text-destructive"
               aria-label={`Delete ${label.name}`}
               onClick={onDelete}
            >
               <Trash2 className="size-3.5" />
            </Button>
         </RowActions>
      </div>
   );
}

/** Workspace "Issue labels" settings: grupos + labels com CRUD real (api.labels/labelGroups). */
export default function IssueLabelsSettings() {
   const [query, setQuery] = useState('');
   const issues = useIssuesStore((s) => s.issues);
   const labels = useLabels();
   const groups = useLabelGroups();
   const catalogLoaded = useCatalogStore((s) => s.loaded);
   const applyLabel = useCatalogStore((s) => s.applyLabel);
   const removeLabel = useCatalogStore((s) => s.removeLabel);
   const applyLabelGroup = useCatalogStore((s) => s.applyLabelGroup);
   const removeLabelGroup = useCatalogStore((s) => s.removeLabelGroup);

   const [dialogOpen, setDialogOpen] = useState(false);
   const [editing, setEditing] = useState<LabelInterface | null>(null);
   const [defaultGroupId, setDefaultGroupId] = useState<string | null>(null);
   const [groupDialogOpen, setGroupDialogOpen] = useState(false);
   const [editingGroup, setEditingGroup] = useState<LabelGroupDto | null>(null);
   const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
   // Alvo e `open` separados: o alvo continua no título durante a saída do dialog
   // (antes o título esvaziava — "Delete label “”?").
   const [deleting, setDeleting] = useState<LabelInterface | null>(null);
   const [deleteOpen, setDeleteOpen] = useState(false);
   const [deletingGroup, setDeletingGroup] = useState<LabelGroupDto | null>(null);
   const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
   const [deleteBusy, setDeleteBusy] = useState(false);

   const { grouped, loose, total } = useMemo(() => {
      const counts = new Map<string, number>();
      for (const issue of issues) {
         for (const label of issue.labels) {
            counts.set(label.id, (counts.get(label.id) ?? 0) + 1);
         }
      }
      const q = query.trim().toLowerCase();
      const knownGroups = new Set(groups.map((g) => g.id));
      const rows: LabelRowData[] = labels
         .map((label) => ({ ...label, issues: counts.get(label.id) ?? 0 }))
         .sort((a, b) => a.name.localeCompare(b.name));
      const matches = (l: LabelRowData) => !q || l.name.toLowerCase().includes(q);
      const grouped = groups
         .map((group) => {
            const inGroup = rows.filter((l) => l.groupId === group.id);
            const groupMatches = !q || group.name.toLowerCase().includes(q);
            return {
               group,
               labels: groupMatches ? inGroup : inGroup.filter(matches),
               size: inGroup.length,
               visible: groupMatches || inGroup.some(matches),
            };
         })
         .filter((g) => g.visible);
      const loose = rows.filter((l) => !(l.groupId && knownGroups.has(l.groupId)) && matches(l));
      return { grouped, loose, total: grouped.length + loose.length };
   }, [query, issues, labels, groups]);

   const openCreate = (groupId: string | null = null) => {
      setEditing(null);
      setDefaultGroupId(groupId);
      setDialogOpen(true);
   };
   const openEdit = (label: LabelInterface) => {
      setEditing(label);
      setDefaultGroupId(null);
      setDialogOpen(true);
   };
   const askDelete = (label: LabelInterface) => {
      setDeleting(label);
      setDeleteOpen(true);
   };

   const submitLabel = async (name: string, color: string, groupId: string | null) => {
      try {
         if (editing) {
            applyLabel(await api.labels.update(editing.id, { name, color, groupId }));
            toast.success(`Label "${name}" updated`);
         } else {
            applyLabel(await api.labels.create({ name, color, groupId }));
            toast.success(`Label "${name}" created`);
         }
      } catch (err) {
         toast.error(
            errorReason(err, editing ? 'Could not update the label' : 'Could not create the label')
         );
         throw err; // mantém o dialog aberto p/ correção
      }
   };

   const submitGroup = async (name: string) => {
      try {
         if (editingGroup) {
            applyLabelGroup(await api.labelGroups.update(editingGroup.id, { name }));
            toast.success(`Group "${name}" updated`);
         } else {
            applyLabelGroup(await api.labelGroups.create({ name }));
            toast.success(`Group "${name}" created`);
         }
      } catch (err) {
         toast.error(
            errorReason(
               err,
               editingGroup ? 'Could not update the group' : 'Could not create the group'
            )
         );
         throw err;
      }
   };

   const confirmDelete = async () => {
      if (!deleting || deleteBusy) return;
      setDeleteBusy(true);
      try {
         await api.labels.remove(deleting.id);
         removeLabel(deleting.id);
         toast.success(`Label "${deleting.name}" deleted`);
         setDeleteOpen(false);
      } catch (err) {
         toast.error(errorReason(err, 'Could not delete the label'));
      } finally {
         setDeleteBusy(false);
      }
   };

   const confirmDeleteGroup = async () => {
      if (!deletingGroup || deleteBusy) return;
      setDeleteBusy(true);
      try {
         await api.labelGroups.remove(deletingGroup.id);
         removeLabelGroup(deletingGroup.id);
         toast.success(`Group "${deletingGroup.name}" deleted`);
         setDeleteGroupOpen(false);
      } catch (err) {
         toast.error(errorReason(err, 'Could not delete the group'));
      } finally {
         setDeleteBusy(false);
      }
   };

   return (
      <SettingsShell
         title="Issue labels"
         action={
            <div className="flex items-center gap-2">
               <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                     setEditingGroup(null);
                     setGroupDialogOpen(true);
                  }}
               >
                  New group
               </Button>
               <Button size="sm" onClick={() => openCreate()}>
                  New label
               </Button>
            </div>
         }
      >
         <div className="flex flex-col gap-4">
            <Input
               placeholder="Filter by name..."
               value={query}
               onChange={(event) => setQuery(event.target.value)}
               className="h-8 w-[300px] max-w-full"
            />

            {total === 0 ? (
               !catalogLoaded ? (
                  <LoadingArea rows={4} />
               ) : query ? (
                  <EmptyState
                     variant="search"
                     title="No labels match your filter"
                     className="py-10"
                  />
               ) : (
                  <EmptyState
                     icon={Tag}
                     title="No labels yet"
                     description="Create your first one."
                     className="py-10"
                  />
               )
            ) : (
               <SettingsCard>
                  {grouped.map(({ group, labels: groupLabels, size }) => {
                     const open = !collapsed[group.id] || !!query.trim();
                     return (
                        <div key={group.id} role="group" aria-label={group.name}>
                           <div className="group/row flex h-11 items-center gap-2 px-4 text-[13px] hover:bg-accent/40">
                              <button
                                 type="button"
                                 aria-expanded={open}
                                 aria-label={`${open ? 'Collapse' : 'Expand'} ${group.name}`}
                                 onClick={() =>
                                    setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))
                                 }
                                 className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              >
                                 <ChevronRight
                                    className={cn(
                                       'size-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                                       open && 'rotate-90'
                                    )}
                                 />
                                 <span className="truncate font-medium">{group.name}</span>
                                 <span className="shrink-0 text-xs text-muted-foreground">
                                    {size} {size === 1 ? 'label' : 'labels'}
                                 </span>
                              </button>
                              <RowActions>
                                 <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    aria-label={`Add label to ${group.name}`}
                                    onClick={() => openCreate(group.id)}
                                 >
                                    <Plus className="size-3.5" />
                                 </Button>
                                 <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    aria-label={`Rename group ${group.name}`}
                                    onClick={() => {
                                       setEditingGroup(group);
                                       setGroupDialogOpen(true);
                                    }}
                                 >
                                    <Pencil className="size-3.5" />
                                 </Button>
                                 <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7 text-muted-foreground hover:text-destructive"
                                    aria-label={`Delete group ${group.name}`}
                                    onClick={() => {
                                       setDeletingGroup(group);
                                       setDeleteGroupOpen(true);
                                    }}
                                 >
                                    <Trash2 className="size-3.5" />
                                 </Button>
                              </RowActions>
                           </div>
                           {open &&
                              groupLabels.map((label) => (
                                 <LabelRow
                                    key={label.id}
                                    label={label}
                                    nested
                                    onEdit={() => openEdit(label)}
                                    onDelete={() => askDelete(label)}
                                 />
                              ))}
                        </div>
                     );
                  })}
                  {loose.map((label) => (
                     <LabelRow
                        key={label.id}
                        label={label}
                        onEdit={() => openEdit(label)}
                        onDelete={() => askDelete(label)}
                     />
                  ))}
               </SettingsCard>
            )}
         </div>

         <LabelDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            initial={editing}
            defaultGroupId={defaultGroupId}
            groups={groups}
            onSubmit={submitLabel}
         />

         <GroupDialog
            open={groupDialogOpen}
            onOpenChange={setGroupDialogOpen}
            initial={editingGroup}
            onSubmit={submitGroup}
         />

         <AlertDialog open={deleteOpen} onOpenChange={(o) => !deleteBusy && setDeleteOpen(o)}>
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

         <AlertDialog
            open={deleteGroupOpen}
            onOpenChange={(o) => !deleteBusy && setDeleteGroupOpen(o)}
         >
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete group “{deletingGroup?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     The labels in this group are kept and become ungrouped. Issues keep their
                     labels.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(e) => {
                        e.preventDefault();
                        void confirmDeleteGroup();
                     }}
                     disabled={deleteBusy}
                     className="bg-destructive text-white hover:bg-destructive/90"
                  >
                     {deleteBusy ? 'Deleting…' : 'Delete group'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </SettingsShell>
   );
}
