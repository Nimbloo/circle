'use client';

import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/common/list-skeleton';
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
import type { TemplateDto } from '@/lib/api/templates';
import { useStatuses, usePriorities } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsShell } from './shared';

const NONE = '__none__';

function TemplateDialog({
   teamId,
   editing,
   open,
   onOpenChange,
   onSaved,
}: {
   teamId: string;
   editing: TemplateDto | null;
   open: boolean;
   onOpenChange: (v: boolean) => void;
   onSaved: () => void;
}) {
   const statuses = useStatuses();
   const priorities = usePriorities();
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');
   const [title, setTitle] = useState('');
   const [description, setDescription] = useState('');
   const [statusId, setStatusId] = useState(NONE);
   const [priorityId, setPriorityId] = useState(NONE);

   useEffect(() => {
      if (open) {
         setName(editing?.name ?? '');
         setTitle(editing?.title ?? '');
         setDescription(editing?.description ?? '');
         setStatusId(editing?.statusId ?? NONE);
         setPriorityId(editing?.priorityId ?? NONE);
      }
   }, [open, editing]);

   const save = async () => {
      if (!name.trim() || busy) return;
      setBusy(true);
      const body = {
         name: name.trim(),
         title: title.trim() || null,
         description: description.trim() || null,
         statusId: statusId === NONE ? null : statusId,
         priorityId: priorityId === NONE ? null : priorityId,
      };
      try {
         if (editing) await api.teams.updateTemplate(teamId, editing.id, body);
         else await api.teams.createTemplate(teamId, body);
         onOpenChange(false);
         onSaved();
         toast.success(editing ? 'Template atualizado' : 'Template criado');
      } catch {
         toast.error('Não foi possível salvar o template');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{editing ? 'Editar template' : 'Novo template'}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tmpl-name">Nome do template</Label>
                  <Input
                     id="tmpl-name"
                     value={name}
                     placeholder="Ex: Bug report"
                     onChange={(e) => setName(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tmpl-title">Título da issue (opcional)</Label>
                  <Input
                     id="tmpl-title"
                     value={title}
                     placeholder="Pré-preenche o título ao usar o template"
                     onChange={(e) => setTitle(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tmpl-desc">Descrição (opcional)</Label>
                  <Textarea
                     id="tmpl-desc"
                     value={description}
                     rows={4}
                     placeholder="Corpo pré-preenchido da issue"
                     onChange={(e) => setDescription(e.target.value)}
                  />
               </div>
               <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                     <Label>Status inicial</Label>
                     <Select value={statusId} onValueChange={setStatusId}>
                        <SelectTrigger>
                           <SelectValue placeholder="Padrão" />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value={NONE}>Padrão do time</SelectItem>
                           {statuses.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                 {s.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <Label>Prioridade</Label>
                     <Select value={priorityId} onValueChange={setPriorityId}>
                        <SelectTrigger>
                           <SelectValue placeholder="Padrão" />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value={NONE}>Nenhuma</SelectItem>
                           {priorities.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                 {p.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               </div>
            </div>
            <DialogFooter>
               <Button size="sm" onClick={() => void save()} disabled={busy || !name.trim()}>
                  {editing ? 'Salvar' : 'Criar template'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Workspace "Issue templates" settings — CRUD real por time. */
export default function IssueTemplatesSettings() {
   const teams = useWorkspaceStore((s) => s.teams);
   const me = useWorkspaceStore((s) => s.me);
   const isAdmin = me?.admin ?? false;

   const [teamId, setTeamId] = useState('');
   const [templates, setTemplates] = useState<TemplateDto[]>([]);
   const [loading, setLoading] = useState(false);
   const [dialogOpen, setDialogOpen] = useState(false);
   const [editing, setEditing] = useState<TemplateDto | null>(null);
   const [toDelete, setToDelete] = useState<TemplateDto | null>(null);

   // Time default = primeiro do usuário.
   useEffect(() => {
      if (!teamId && teams.length > 0) setTeamId(teams[0].id);
   }, [teams, teamId]);

   const load = useCallback(async () => {
      if (!teamId) return;
      setLoading(true);
      try {
         setTemplates(await api.teams.templates(teamId));
      } catch {
         setTemplates([]);
      } finally {
         setLoading(false);
      }
   }, [teamId]);

   useEffect(() => {
      void load();
   }, [load]);

   const confirmDelete = async () => {
      if (!toDelete) return;
      try {
         await api.teams.deleteTemplate(teamId, toDelete.id);
         setToDelete(null);
         await load();
         toast.success('Template excluído');
      } catch {
         toast.error('Não foi possível excluir o template');
      }
   };

   return (
      <SettingsShell
         title="Issue templates"
         description="Templates pré-preenchem título, descrição, status e prioridade ao criar uma issue. São definidos por time."
      >
         <div className="flex items-center justify-between gap-3 mb-4">
            <Select value={teamId} onValueChange={setTeamId}>
               <SelectTrigger className="w-64">
                  <SelectValue placeholder="Selecione um time" />
               </SelectTrigger>
               <SelectContent>
                  {teams.map((t) => (
                     <SelectItem key={t.id} value={t.id}>
                        {t.icon} {t.name}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            {isAdmin && teamId && (
               <Button
                  size="sm"
                  onClick={() => {
                     setEditing(null);
                     setDialogOpen(true);
                  }}
                  className="gap-1"
               >
                  <Plus className="size-4" />
                  Novo template
               </Button>
            )}
         </div>

         <div className="rounded-lg border bg-container overflow-hidden">
            {loading ? (
               <ListSkeleton rows={4} />
            ) : templates.length === 0 ? (
               <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <FileText className="size-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">Nenhum template ainda</p>
                  <p className="text-xs text-muted-foreground">
                     {isAdmin
                        ? 'Crie um template para acelerar a criação de issues recorrentes.'
                        : 'Peça a um administrador para criar templates para este time.'}
                  </p>
               </div>
            ) : (
               templates.map((tmpl) => (
                  <div
                     key={tmpl.id}
                     className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-border/50"
                  >
                     <FileText className="size-4 text-muted-foreground shrink-0" />
                     <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{tmpl.name}</div>
                        {tmpl.title && (
                           <div className="text-xs text-muted-foreground truncate">
                              {tmpl.title}
                           </div>
                        )}
                     </div>
                     {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                           <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              aria-label="Editar template"
                              onClick={() => {
                                 setEditing(tmpl);
                                 setDialogOpen(true);
                              }}
                           >
                              <Pencil className="size-3.5" />
                           </Button>
                           <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 text-destructive hover:text-destructive"
                              aria-label="Excluir template"
                              onClick={() => setToDelete(tmpl)}
                           >
                              <Trash2 className="size-3.5" />
                           </Button>
                        </div>
                     )}
                  </div>
               ))
            )}
         </div>

         {teamId && (
            <TemplateDialog
               teamId={teamId}
               editing={editing}
               open={dialogOpen}
               onOpenChange={setDialogOpen}
               onSaved={load}
            />
         )}

         <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Excluir “{toDelete?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     O template será removido. Issues já criadas não são afetadas.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(e) => {
                        e.preventDefault();
                        void confirmDelete();
                     }}
                  >
                     Excluir
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </SettingsShell>
   );
}
