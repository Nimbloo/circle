'use client';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingArea } from '@/components/common/loading-area';
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
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorReason } from '@/lib/error-reason';
import { SettingsShell } from './shared';
import { useAsyncResource } from '@/hooks/use-async-resource';
import { CATALOG_CHANGED_EVENT, useLiveReload } from '@/lib/use-live-sync';

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
      } catch (err) {
         toast.error(errorReason(err, 'Não foi possível salvar o template'));
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
   const [dialogOpen, setDialogOpen] = useState(false);
   const [editing, setEditing] = useState<TemplateDto | null>(null);
   const [toDelete, setToDelete] = useState<TemplateDto | null>(null);
   // Separado de `toDelete` (ad#4): fechar não pode esvaziar o nome no título durante a
   // animação de saída — só zera o alvo ao abrir um novo.
   const [deleteOpen, setDeleteOpen] = useState(false);

   // Time default = primeiro do usuário.
   useEffect(() => {
      if (!teamId && teams.length > 0) setTeamId(teams[0].id);
   }, [teams, teamId]);

   // R4 (#57): seq por time — resposta atrasada do time anterior nunca aparece; troca
   // de time mostra loading; reload do mesmo time é silencioso; falha vira erro, não vazio.
   const resource = useAsyncResource(teamId || null, (id) => api.teams.templates(id));
   const templates = resource.data ?? [];
   const loading = resource.loading;
   const load = resource.reload;
   // Template criado/editado por OUTRO admin chega por evento `catalog` (#53).
   useLiveReload(CATALOG_CHANGED_EVENT, { teamId, kind: 'template' }, load);

   const confirmDelete = async () => {
      if (!toDelete) return;
      try {
         await api.teams.deleteTemplate(teamId, toDelete.id);
         setDeleteOpen(false);
         await load();
         toast.success('Template excluído');
      } catch (err) {
         toast.error(errorReason(err, 'Não foi possível excluir o template'));
      }
   };

   return (
      <SettingsShell
         title="Issue templates"
         action={
            isAdmin && teamId ? (
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
            ) : undefined
         }
         description="Templates pré-preenchem título, descrição, status e prioridade ao criar uma issue. São definidos por time."
      >
         <div className="mb-4 flex items-center gap-3">
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
         </div>

         <div className="overflow-hidden rounded-[10px] bg-card">
            {loading ? (
               <LoadingArea rows={4} />
            ) : resource.error ? (
               <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                  Não foi possível carregar os templates.
                  <Button size="sm" variant="outline" onClick={() => void load()}>
                     Tentar novamente
                  </Button>
               </div>
            ) : templates.length === 0 ? (
               <EmptyState
                  icon={FileText}
                  title="Nenhum template ainda"
                  description={
                     isAdmin
                        ? 'Crie um template para acelerar a criação de issues recorrentes.'
                        : 'Peça a um administrador para criar templates para este time.'
                  }
                  className="py-10"
               />
            ) : (
               <div className="content-enter">
                  {templates.map((tmpl) => (
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
                                 onClick={() => {
                                    setToDelete(tmpl);
                                    setDeleteOpen(true);
                                 }}
                              >
                                 <Trash2 className="size-3.5" />
                              </Button>
                           </div>
                        )}
                     </div>
                  ))}
               </div>
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

         <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
