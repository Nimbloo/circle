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
import type { ProjectTemplateDto } from '@/lib/api/project-templates';
import { useStatuses, usePriorities, useHealthStates } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react';
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
   editing: ProjectTemplateDto | null;
   open: boolean;
   onOpenChange: (v: boolean) => void;
   onSaved: () => void;
}) {
   const statuses = useStatuses();
   const priorities = usePriorities();
   const healthStates = useHealthStates();
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState('');
   const [projectName, setProjectName] = useState('');
   const [description, setDescription] = useState('');
   const [statusId, setStatusId] = useState(NONE);
   const [priorityId, setPriorityId] = useState(NONE);
   const [healthId, setHealthId] = useState(NONE);

   useEffect(() => {
      if (open) {
         setName(editing?.name ?? '');
         setProjectName(editing?.projectName ?? '');
         setDescription(editing?.description ?? '');
         setStatusId(editing?.statusId ?? NONE);
         setPriorityId(editing?.priorityId ?? NONE);
         setHealthId(editing?.healthId ?? NONE);
      }
   }, [open, editing]);

   const save = async () => {
      if (!name.trim() || busy) return;
      setBusy(true);
      const body = {
         name: name.trim(),
         projectName: projectName.trim() || null,
         description: description.trim() || null,
         statusId: statusId === NONE ? null : statusId,
         priorityId: priorityId === NONE ? null : priorityId,
         healthId: healthId === NONE ? null : healthId,
      };
      try {
         if (editing) await api.teams.updateProjectTemplate(teamId, editing.id, body);
         else await api.teams.createProjectTemplate(teamId, body);
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
               <DialogTitle>{editing ? 'Editar template' : 'Novo template de projeto'}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pt-name">Nome do template</Label>
                  <Input
                     id="pt-name"
                     value={name}
                     placeholder="Ex: Novo serviço"
                     onChange={(e) => setName(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pt-project">Nome do projeto (opcional)</Label>
                  <Input
                     id="pt-project"
                     value={projectName}
                     placeholder="Pré-preenche o nome ao usar o template"
                     onChange={(e) => setProjectName(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pt-desc">Descrição (opcional)</Label>
                  <Textarea
                     id="pt-desc"
                     value={description}
                     rows={3}
                     placeholder="Resumo pré-preenchido do projeto"
                     onChange={(e) => setDescription(e.target.value)}
                  />
               </div>
               <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1.5">
                     <Label>Status</Label>
                     <Select value={statusId} onValueChange={setStatusId}>
                        <SelectTrigger>
                           <SelectValue placeholder="Padrão" />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value={NONE}>Padrão</SelectItem>
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
                  <div className="flex flex-col gap-1.5">
                     <Label>Health</Label>
                     <Select value={healthId} onValueChange={setHealthId}>
                        <SelectTrigger>
                           <SelectValue placeholder="Padrão" />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value={NONE}>Padrão</SelectItem>
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
                  {editing ? 'Salvar' : 'Criar template'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Workspace "Project templates" settings — CRUD real por time. */
export default function ProjectTemplatesSettings() {
   const teams = useWorkspaceStore((s) => s.teams);
   const me = useWorkspaceStore((s) => s.me);
   const isAdmin = me?.admin ?? false;

   const [teamId, setTeamId] = useState('');
   const [templates, setTemplates] = useState<ProjectTemplateDto[]>([]);
   const [loading, setLoading] = useState(false);
   const [dialogOpen, setDialogOpen] = useState(false);
   const [editing, setEditing] = useState<ProjectTemplateDto | null>(null);
   const [toDelete, setToDelete] = useState<ProjectTemplateDto | null>(null);

   useEffect(() => {
      if (!teamId && teams.length > 0) setTeamId(teams[0].id);
   }, [teams, teamId]);

   const load = useCallback(async () => {
      if (!teamId) return;
      setLoading(true);
      try {
         setTemplates(await api.teams.projectTemplates(teamId));
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
         await api.teams.deleteProjectTemplate(teamId, toDelete.id);
         setToDelete(null);
         await load();
         toast.success('Template excluído');
      } catch {
         toast.error('Não foi possível excluir o template');
      }
   };

   return (
      <SettingsShell
         title="Project templates"
         description="Templates pré-preenchem nome, descrição, status, prioridade e health ao criar um projeto. São definidos por time."
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
               <div className="px-4 py-6 text-sm text-muted-foreground">Carregando…</div>
            ) : templates.length === 0 ? (
               <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <FolderKanban className="size-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">Nenhum template de projeto ainda</p>
                  <p className="text-xs text-muted-foreground">
                     {isAdmin
                        ? 'Crie um template para padronizar projetos recorrentes.'
                        : 'Peça a um administrador para criar templates para este time.'}
                  </p>
               </div>
            ) : (
               templates.map((tmpl) => (
                  <div
                     key={tmpl.id}
                     className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-border/50"
                  >
                     <FolderKanban className="size-4 text-muted-foreground shrink-0" />
                     <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{tmpl.name}</div>
                        {tmpl.projectName && (
                           <div className="text-xs text-muted-foreground truncate">
                              {tmpl.projectName}
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
                     O template será removido. Projetos já criados não são afetados.
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
