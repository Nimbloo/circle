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
   DialogDescription,
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
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/client';
import type { TeamSlaDto } from '@/lib/api/slas';
import type {
   AutomationAction,
   AutomationConfig,
   AutomationTrigger,
   TeamAutomationDto,
} from '@/lib/api/automations';
import { useLabels, usePriorities, useStatuses } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Pencil, Plus, Timer, Trash2, Workflow } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/**
 * Team settings → Workflows & automations (#97): SLAs por prioridade e as regras de
 * automação do time (gatilho + ação), no padrão do Linear (linha com controle à direita).
 */

const TRIGGER_LABEL: Record<AutomationTrigger, string> = {
   'issue.created_in_triage': 'Issue created in Triage',
   'issue.status_changed': 'Issue status changed',
   'issue.label_added': 'Label added to issue',
   'pr.merged': 'Pull request merged',
};

const ACTION_LABEL: Record<AutomationAction, string> = {
   add_label: 'Add label',
   set_status: 'Set status',
   set_priority: 'Set priority',
   set_assignee: 'Assign to',
   close_sub_issues: 'Close sub-issues',
};

const STATUS_CATEGORIES = [
   'triage',
   'backlog',
   'unstarted',
   'started',
   'completed',
   'canceled',
] as const;

/* ---------------------------------- SLAs ---------------------------------- */

/** Uma linha por prioridade: input de horas (vazio = sem SLA), salvo no blur/Enter. */
function SlaRow({
   teamId,
   priorityId,
   priorityName,
   hours,
   disabled,
   onSaved,
}: {
   teamId: string;
   priorityId: string;
   priorityName: string;
   hours: number | null;
   disabled: boolean;
   onSaved: (next: TeamSlaDto[]) => void;
}) {
   const [value, setValue] = useState(hours === null ? '' : String(hours));
   const [busy, setBusy] = useState(false);
   useEffect(() => setValue(hours === null ? '' : String(hours)), [hours]);

   const save = async () => {
      const trimmed = value.trim();
      const next = trimmed === '' ? null : Number(trimmed);
      if (next !== null && (!Number.isInteger(next) || next < 1)) {
         toast.error('Informe um número inteiro de horas (ou deixe vazio)');
         setValue(hours === null ? '' : String(hours));
         return;
      }
      if (next === hours || busy) return;
      setBusy(true);
      try {
         onSaved(await api.teamSlas.set(teamId, priorityId, next));
         toast.success('SLA atualizado');
      } catch {
         toast.error('Não foi possível atualizar o SLA');
         setValue(hours === null ? '' : String(hours));
      } finally {
         setBusy(false);
      }
   };

   return (
      <SettingsRow
         icon={<Timer className="size-4" />}
         title={priorityName}
         description="Prazo em horas a partir da criação (vazio = sem SLA)"
         trailing={
            <div className="flex items-center gap-1.5">
               <Input
                  aria-label={`SLA hours for ${priorityName}`}
                  inputMode="numeric"
                  value={value}
                  disabled={disabled || busy}
                  onChange={(e) => setValue(e.target.value)}
                  onBlur={() => void save()}
                  onKeyDown={(e) => {
                     if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className="h-[30px] w-20 text-center tabular-nums"
                  placeholder="—"
               />
               <span className="text-xs">h</span>
            </div>
         }
      />
   );
}

/* ------------------------------- Automations ------------------------------- */

interface AutomationDraft {
   name: string;
   trigger: AutomationTrigger;
   action: AutomationAction;
   config: AutomationConfig;
}

const EMPTY_DRAFT: AutomationDraft = {
   name: '',
   trigger: 'issue.created_in_triage',
   action: 'set_priority',
   config: {},
};

function AutomationDialog({
   open,
   onOpenChange,
   initial,
   onSubmit,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   initial: TeamAutomationDto | null;
   onSubmit: (draft: AutomationDraft) => Promise<void>;
}) {
   const statuses = useStatuses();
   const priorities = usePriorities();
   const labels = useLabels();
   const users = useWorkspaceStore((s) => s.users);
   const [draft, setDraft] = useState<AutomationDraft>(EMPTY_DRAFT);
   const [busy, setBusy] = useState(false);

   const [seededFor, setSeededFor] = useState<string | null>(null);
   const seedKey = `${open}:${initial?.id ?? 'new'}`;
   if (open && seededFor !== seedKey) {
      setDraft(
         initial
            ? {
                 name: initial.name,
                 trigger: initial.trigger,
                 action: initial.action,
                 config: initial.config,
              }
            : EMPTY_DRAFT
      );
      setSeededFor(seedKey);
   } else if (!open && seededFor !== null) {
      setSeededFor(null);
   }

   const patch = (next: Partial<AutomationDraft>) => setDraft((d) => ({ ...d, ...next }));
   const patchConfig = (next: Partial<AutomationConfig>) =>
      setDraft((d) => ({ ...d, config: { ...d.config, ...next } }));

   const submit = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await onSubmit({ ...draft, name: draft.name.trim() });
         onOpenChange(false);
      } catch {
         // o chamador já mostra o toast
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{initial ? 'Editar automação' : 'Nova automação'}</DialogTitle>
               <DialogDescription>
                  Escolha o gatilho, a ação e os parâmetros aplicados na issue.
               </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="automation-name">Nome</Label>
                  <Input
                     id="automation-name"
                     value={draft.name}
                     placeholder="Ex.: Triage → urgente"
                     onChange={(e) => patch({ name: e.target.value })}
                  />
               </div>

               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="automation-trigger">Quando</Label>
                  <Select
                     value={draft.trigger}
                     onValueChange={(v) => patch({ trigger: v as AutomationTrigger })}
                  >
                     <SelectTrigger id="automation-trigger" aria-label="Trigger">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {(Object.keys(TRIGGER_LABEL) as AutomationTrigger[]).map((t) => (
                           <SelectItem key={t} value={t}>
                              {TRIGGER_LABEL[t]}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>

               {draft.trigger === 'issue.status_changed' && (
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="automation-category">Para a categoria</Label>
                     <Select
                        value={draft.config.toCategory ?? 'any'}
                        onValueChange={(v) => patchConfig({ toCategory: v === 'any' ? null : v })}
                     >
                        <SelectTrigger id="automation-category" aria-label="Status category">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="any">Qualquer categoria</SelectItem>
                           {STATUS_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                 {c}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               )}

               {draft.trigger === 'issue.label_added' && (
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="automation-trigger-label">Label do gatilho</Label>
                     <Select
                        value={draft.config.triggerLabelId ?? ''}
                        onValueChange={(v) => patchConfig({ triggerLabelId: v })}
                     >
                        <SelectTrigger id="automation-trigger-label" aria-label="Trigger label">
                           <SelectValue placeholder="Escolha uma label" />
                        </SelectTrigger>
                        <SelectContent>
                           {labels.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                 {l.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               )}

               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="automation-action">Então</Label>
                  <Select
                     value={draft.action}
                     onValueChange={(v) => patch({ action: v as AutomationAction })}
                  >
                     <SelectTrigger id="automation-action" aria-label="Action">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {(Object.keys(ACTION_LABEL) as AutomationAction[]).map((a) => (
                           <SelectItem key={a} value={a}>
                              {ACTION_LABEL[a]}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>

               {draft.action === 'add_label' && (
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="automation-label">Label</Label>
                     <Select
                        value={draft.config.labelId ?? ''}
                        onValueChange={(v) => patchConfig({ labelId: v })}
                     >
                        <SelectTrigger id="automation-label" aria-label="Label">
                           <SelectValue placeholder="Escolha uma label" />
                        </SelectTrigger>
                        <SelectContent>
                           {labels.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                 {l.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               )}

               {(draft.action === 'set_status' || draft.action === 'close_sub_issues') && (
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="automation-status">
                        {draft.action === 'set_status' ? 'Status' : 'Status das filhas'}
                     </Label>
                     <Select
                        value={draft.config.statusId ?? ''}
                        onValueChange={(v) => patchConfig({ statusId: v })}
                     >
                        <SelectTrigger id="automation-status" aria-label="Status">
                           <SelectValue placeholder="Escolha um status" />
                        </SelectTrigger>
                        <SelectContent>
                           {statuses.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                 {s.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               )}

               {draft.action === 'set_priority' && (
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="automation-priority">Prioridade</Label>
                     <Select
                        value={draft.config.priorityId ?? ''}
                        onValueChange={(v) => patchConfig({ priorityId: v })}
                     >
                        <SelectTrigger id="automation-priority" aria-label="Priority">
                           <SelectValue placeholder="Escolha uma prioridade" />
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
               )}

               {draft.action === 'set_assignee' && (
                  <div className="flex flex-col gap-1.5">
                     <Label htmlFor="automation-assignee">Responsável</Label>
                     <Select
                        value={draft.config.assigneeId ?? ''}
                        onValueChange={(v) => patchConfig({ assigneeId: v })}
                     >
                        <SelectTrigger id="automation-assignee" aria-label="Assignee">
                           <SelectValue placeholder="Escolha uma pessoa" />
                        </SelectTrigger>
                        <SelectContent>
                           {users.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                 {u.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               )}
            </div>
            <DialogFooter>
               <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
               </Button>
               <Button disabled={!draft.name.trim() || busy} onClick={() => void submit()}>
                  {initial ? 'Salvar' : 'Criar'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Resumo legível da regra ("Quando X, então Y"). */
function describe(rule: TeamAutomationDto): string {
   return `${TRIGGER_LABEL[rule.trigger]} → ${ACTION_LABEL[rule.action]}`;
}

/* ---------------------------------- página --------------------------------- */

export default function TeamWorkflowsSettings({ teamId }: { teamId: string }) {
   const teams = useWorkspaceStore((s) => s.teams);
   const me = useWorkspaceStore((s) => s.me);
   const priorities = usePriorities();
   const team = teams.find((t) => t.id === teamId);
   const isAdmin = me?.admin ?? false;

   const [slas, setSlas] = useState<TeamSlaDto[]>([]);
   const [automations, setAutomations] = useState<TeamAutomationDto[]>([]);
   const [loading, setLoading] = useState(true);
   const [dialogOpen, setDialogOpen] = useState(false);
   const [editing, setEditing] = useState<TeamAutomationDto | null>(null);
   const [removing, setRemoving] = useState<TeamAutomationDto | null>(null);

   useEffect(() => {
      let alive = true;
      setLoading(true);
      Promise.all([api.teamSlas.list(teamId), api.automations.list(teamId)])
         .then(([slaList, ruleList]) => {
            if (!alive) return;
            setSlas(slaList);
            setAutomations(ruleList);
         })
         .catch(() => {
            if (alive) toast.error('Não foi possível carregar workflows do time');
         })
         .finally(() => {
            if (alive) setLoading(false);
         });
      return () => {
         alive = false;
      };
   }, [teamId]);

   const submitAutomation = useCallback(
      async (draft: AutomationDraft) => {
         try {
            if (editing) {
               const dto = await api.automations.update(teamId, editing.id, draft);
               setAutomations((list) => list.map((r) => (r.id === dto.id ? dto : r)));
               toast.success('Automação atualizada');
            } else {
               const dto = await api.automations.create(teamId, draft);
               setAutomations((list) => [...list, dto]);
               toast.success('Automação criada');
            }
         } catch {
            toast.error('Não foi possível salvar a automação');
            throw new Error('save failed');
         }
      },
      [editing, teamId]
   );

   // Otimista + rollback: o toggle reflete na hora e volta atrás se a API recusar.
   const toggle = async (rule: TeamAutomationDto, enabled: boolean) => {
      setAutomations((list) => list.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
      try {
         const dto = await api.automations.update(teamId, rule.id, { enabled });
         setAutomations((list) => list.map((r) => (r.id === dto.id ? dto : r)));
         toast.success(enabled ? 'Automação ativada' : 'Automação desativada');
      } catch {
         setAutomations((list) => list.map((r) => (r.id === rule.id ? rule : r)));
         toast.error('Não foi possível atualizar a automação');
      }
   };

   const remove = async (rule: TeamAutomationDto) => {
      const previous = automations;
      setAutomations((list) => list.filter((r) => r.id !== rule.id));
      setRemoving(null);
      try {
         await api.automations.remove(teamId, rule.id);
         toast.success('Automação excluída');
      } catch {
         setAutomations(previous);
         toast.error('Não foi possível excluir a automação');
      }
   };

   if (!team) return <SettingsShell title="Team not found">{null}</SettingsShell>;

   const hoursOf = (priorityId: string) =>
      slas.find((s) => s.priorityId === priorityId)?.hours ?? null;

   return (
      <>
         <SettingsShell
            title="Workflows & automations"
            description={`Regras e SLAs do time ${team.name}`}
         >
            <SettingsSection
               title="SLAs"
               description="Prazo por prioridade: uma issue criada sem due date ganha a data automaticamente."
            >
               <SettingsCard>
                  {priorities.map((p) => (
                     <SlaRow
                        key={p.id}
                        teamId={teamId}
                        priorityId={p.id}
                        priorityName={p.name}
                        hours={hoursOf(p.id)}
                        disabled={!isAdmin || loading}
                        onSaved={setSlas}
                     />
                  ))}
               </SettingsCard>
            </SettingsSection>

            <SettingsSection
               title="Automations"
               description="Quando um gatilho acontece, a ação é aplicada na issue."
               action={
                  isAdmin ? (
                     <Button
                        size="xs"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                           setEditing(null);
                           setDialogOpen(true);
                        }}
                     >
                        <Plus className="size-3.5" />
                        Nova automação
                     </Button>
                  ) : undefined
               }
            >
               <SettingsCard>
                  {automations.length === 0 ? (
                     <SettingsRow
                        icon={<Workflow className="size-4" />}
                        title={loading ? 'Carregando…' : 'Nenhuma automação'}
                        description="Crie a primeira regra para o time"
                        muted
                     />
                  ) : (
                     automations.map((rule) => (
                        <SettingsRow
                           key={rule.id}
                           icon={<Workflow className="size-4" />}
                           title={rule.name}
                           description={describe(rule)}
                           trailing={
                              <div className="flex items-center gap-2">
                                 <Switch
                                    checked={rule.enabled}
                                    disabled={!isAdmin}
                                    aria-label={`Toggle ${rule.name}`}
                                    onCheckedChange={(v) => void toggle(rule, v)}
                                 />
                                 {isAdmin && (
                                    <>
                                       <button
                                          type="button"
                                          aria-label={`Edit ${rule.name}`}
                                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                          onClick={() => {
                                             setEditing(rule);
                                             setDialogOpen(true);
                                          }}
                                       >
                                          <Pencil className="size-3.5" />
                                       </button>
                                       <button
                                          type="button"
                                          aria-label={`Delete ${rule.name}`}
                                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                                          onClick={() => setRemoving(rule)}
                                       >
                                          <Trash2 className="size-3.5" />
                                       </button>
                                    </>
                                 )}
                              </div>
                           }
                        />
                     ))
                  )}
               </SettingsCard>
            </SettingsSection>
         </SettingsShell>

         <AutomationDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            initial={editing}
            onSubmit={submitAutomation}
         />

         <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Excluir automação</AlertDialogTitle>
                  <AlertDialogDescription>
                     {removing ? `"${removing.name}" deixa de rodar neste time.` : null}
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removing && void remove(removing)}>
                     Excluir
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}
