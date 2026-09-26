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
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { ESTIMATE_SCALE_META, normalizeScale, type EstimateScale } from '@/data/estimate-scales';
import { useLabels, useStatuses } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { teamWithDescendants } from '@/lib/team-tree';
import { DeleteTeamDialog } from '@/components/common/teams/delete-team-dialog';
import type { Team } from '@/data/teams';
import {
   Bot,
   ChevronRight,
   CornerLeftUp,
   CornerRightDown,
   FileText,
   Hourglass,
   Network,
   Pencil,
   Radar,
   RefreshCcw,
   Settings,
   Tag,
   Target,
   Users,
   Workflow,
   Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorReason } from '@/lib/error-reason';
import { landingHref } from '@/lib/landing';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';
import { useSeedOnOpen } from '@/hooks/use-seed-on-open';
import { LoadingArea } from '@/components/common/loading-area';

interface TeamSettingsProps {
   teamId: string;
}

/** Edita nome + ícone (emoji) do time (admin). Persiste via PATCH /teams/[key]. */
const TEAM_COLORS = [
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

function EditTeamDialog({
   team,
   open,
   onOpenChange,
}: {
   team: { id: string; name: string; icon: string | null; color: string | null };
   open: boolean;
   onOpenChange: (v: boolean) => void;
}) {
   const applyTeam = useWorkspaceStore((s) => s.applyTeam);
   const teamFromStore = useWorkspaceStore((s) => s.getTeamById(team.id));
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState(team.name);
   const [icon, setIcon] = useState(team.icon ?? '');
   const [color, setColor] = useState(team.color ?? TEAM_COLORS[6]);
   const [scale, setScale] = useState<EstimateScale>('fibonacci');

   // #38: só ao abrir — evento de time com o diálogo aberto não apaga o que foi digitado.
   useSeedOnOpen(open, () => {
      setName(team.name);
      setIcon(team.icon ?? '');
      setColor(team.color ?? TEAM_COLORS[6]);
      setScale(normalizeScale(teamFromStore?.estimateScale));
   });

   const save = async () => {
      if (!name.trim() || busy) return;
      setBusy(true);
      try {
         const dto = await api.teams.update(team.id, {
            name: name.trim(),
            icon: icon.trim() || null,
            color,
            estimateScale: scale,
         });
         applyTeam(dto);
         onOpenChange(false);
         toast.success('Time atualizado');
      } catch (err) {
         toast.error(errorReason(err, 'Não foi possível atualizar o time'));
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Editar time</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-team-name">Nome</Label>
                  <Input
                     id="edit-team-name"
                     value={name}
                     maxLength={128}
                     onChange={(e) => setName(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void save();
                     }}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-team-identifier">Identificador</Label>
                  <Input id="edit-team-identifier" value={team.id} readOnly disabled />
                  <p className="text-xs text-muted-foreground">
                     O identificador batiza as issues do time (ENG-123) e não muda depois de criado.
                  </p>
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-team-icon">Ícone (emoji)</Label>
                  <Input
                     id="edit-team-icon"
                     value={icon}
                     // Emoji composto passa de 4 unidades UTF-16 (o limite antigo cortava).
                     maxLength={16}
                     placeholder="📋"
                     onChange={(e) => setIcon(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void save();
                     }}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label>Cor</Label>
                  <div className="flex flex-wrap items-center gap-2">
                     {TEAM_COLORS.map((preset) => (
                        <button
                           key={preset}
                           type="button"
                           aria-label={`Usar a cor ${preset}`}
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
                  </div>
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-team-scale">Escala de estimativa</Label>
                  <Select value={scale} onValueChange={(v) => setScale(v as EstimateScale)}>
                     <SelectTrigger id="edit-team-scale" className="h-9">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {(Object.keys(ESTIMATE_SCALE_META) as EstimateScale[]).map((s) => (
                           <SelectItem key={s} value={s}>
                              {ESTIMATE_SCALE_META[s]}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>
            </div>
            <DialogFooter>
               <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
               >
                  Cancelar
               </Button>
               <Button size="sm" onClick={() => void save()} disabled={busy || !name.trim()}>
                  Salvar
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/**
 * Cool-down entre cycles (dias, 0–14). Persiste no blur/Enter via PATCH /teams/[key];
 * o toast só depois que a API confirma, e o input volta ao valor salvo se falhar.
 */
function CooldownDaysInput({
   team,
   disabled,
}: {
   team: { id: string; cycleCooldownDays: number };
   disabled: boolean;
}) {
   const applyTeam = useWorkspaceStore((s) => s.applyTeam);
   const [value, setValue] = useState(String(team.cycleCooldownDays));
   const [busy, setBusy] = useState(false);

   useEffect(() => setValue(String(team.cycleCooldownDays)), [team.cycleCooldownDays]);

   const commit = async () => {
      const parsed = value.trim() === '' ? NaN : Number(value);
      if (!Number.isFinite(parsed)) {
         setValue(String(team.cycleCooldownDays));
         return;
      }
      const days = Math.max(0, Math.min(14, Math.round(parsed)));
      setValue(String(days));
      if (days === team.cycleCooldownDays || busy) return;
      setBusy(true);
      try {
         applyTeam(await api.teams.update(team.id, { cycleCooldownDays: days }));
         toast.success('Cool-down atualizado');
      } catch {
         setValue(String(team.cycleCooldownDays));
         toast.error('Não foi possível atualizar o cool-down');
      } finally {
         setBusy(false);
      }
   };

   return (
      <div className="flex items-center gap-2">
         <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={14}
            value={value}
            disabled={disabled || busy}
            aria-label="Cool-down (dias)"
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
               if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="h-[30px] w-16 bg-accent text-right"
         />
         <span>dias</span>
      </div>
   );
}

/**
 * Toggle de automação de sub-issues (#95). Otimista no Switch, mas o toast de sucesso
 * só depois que a API confirma; se falhar, volta ao valor salvo.
 */
function AutoCloseToggle({
   team,
   field,
   label,
   disabled,
}: {
   team: { id: string; autoCloseParent: boolean; autoCloseChildren: boolean };
   field: 'autoCloseParent' | 'autoCloseChildren';
   label: string;
   disabled: boolean;
}) {
   const applyTeam = useWorkspaceStore((s) => s.applyTeam);
   const [busy, setBusy] = useState(false);
   const [optimistic, setOptimistic] = useState<boolean | null>(null);
   const checked = optimistic ?? team[field];

   const toggle = async (next: boolean) => {
      if (busy) return;
      setBusy(true);
      setOptimistic(next);
      try {
         applyTeam(await api.teams.update(team.id, { [field]: next }));
         toast.success('Automação atualizada');
      } catch {
         toast.error('Não foi possível atualizar a automação');
      } finally {
         setOptimistic(null);
         setBusy(false);
      }
   };

   return (
      <Switch
         checked={checked}
         disabled={disabled || busy}
         aria-label={label}
         onCheckedChange={(v) => void toggle(v)}
      />
   );
}

/** Valor sentinela do Select — Radix não aceita `value=""`. */
const NO_PARENT = '__none__';

/**
 * Seletor de time pai (#100). Lista os times que NÃO estão na subárvore do time
 * atual (o servidor recusa ciclo com 400; a UI já esconde a opção inválida).
 * Otimista não faz sentido aqui — o toast só vem depois do PATCH.
 */
function ParentTeamSelect({ team, disabled }: { team: Team; disabled: boolean }) {
   const teams = useWorkspaceStore((s) => s.teams);
   const applyTeam = useWorkspaceStore((s) => s.applyTeam);
   const [busy, setBusy] = useState(false);

   const descendants = new Set(teamWithDescendants(teams, team.id));
   const options = teams.filter((t) => !descendants.has(t.id));

   const commit = async (next: string) => {
      const parentId = next === NO_PARENT ? null : next;
      if (parentId === team.parentId || busy) return;
      setBusy(true);
      try {
         applyTeam(await api.teams.update(team.id, { parentId }));
         toast.success('Time pai atualizado');
      } catch {
         toast.error('Não foi possível atualizar o time pai');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Select
         value={team.parentId ?? NO_PARENT}
         disabled={disabled || busy}
         onValueChange={(v) => void commit(v)}
      >
         <SelectTrigger aria-label="Parent team" className="h-[30px] w-44 bg-accent text-xs">
            <SelectValue />
         </SelectTrigger>
         <SelectContent>
            <SelectItem value={NO_PARENT} className="text-xs">
               No parent team
            </SelectItem>
            {options.map((t) => (
               <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.name}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   );
}

/** Per-team settings page (general, workflow, AI and danger zone). */
export default function TeamSettings({ teamId }: TeamSettingsProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const teams = useWorkspaceStore((s) => s.teams);
   const me = useWorkspaceStore((s) => s.me);
   const loaded = useWorkspaceStore((s) => s.loaded);
   const applyTeamMembers = useWorkspaceStore((s) => s.applyTeamMembers);
   // Deriva da fatia assinada: `getCyclesByTeam` devolve array NOVO a cada leitura,
   // entao nao pode ir dentro do seletor (referencia nova = re-render infinito).
   const allCycles = useWorkspaceStore((s) => s.cycles);
   const status = useStatuses();
   const labels = useLabels();
   const team = teams.find((candidate) => candidate.id === teamId);

   const [editOpen, setEditOpen] = useState(false);
   const [leaveOpen, setLeaveOpen] = useState(false);
   const [deleteOpen, setDeleteOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const isAdmin = me?.admin ?? false;

   if (!team) {
      // Deep-link frio: "not found" só depois que o workspace hidratou.
      if (!loaded) return <LoadingArea rows={8} className="h-full" />;
      return <SettingsShell title="Team not found">{null}</SettingsShell>;
   }

   const cycles = allCycles.filter((c) => c.teamId === team.id);
   // Hierarquia (#100): o pai e os filhos diretos deste time.
   const parent = team.parentId ? teams.find((t) => t.id === team.parentId) : undefined;
   const children = teams
      .filter((t) => t.parentId === team.id)
      .sort((a, b) => a.name.localeCompare(b.name));

   const leaveTeam = async () => {
      if (busy) return;
      setBusy(true);
      try {
         applyTeamMembers(team.id, await api.teams.leave(team.id));
         toast.success('Você saiu do time');
         router.push(landingHref(orgId));
      } catch {
         toast.error('Não foi possível sair do time');
         setBusy(false);
      }
   };

   return (
      <>
         <SettingsShell
            title={team.name}
            description="Accessible to all workspace members"
            action={
               <div className="flex shrink-0 items-center gap-3">
                  {isAdmin && (
                     <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditOpen(true)}
                        className="gap-1"
                     >
                        <Pencil className="size-3.5" />
                        Editar
                     </Button>
                  )}
                  <Link
                     href={`/${orgId}/team/${team.id}/overview`}
                     className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground max-sm:hidden"
                  >
                     Team overview
                     <ChevronRight className="size-4" />
                  </Link>
               </div>
            }
         >
            <SettingsSection>
               <SettingsCard>
                  <SettingsRow
                     icon={<Settings className="size-4" />}
                     title="General"
                     description="Nome, ícone, cor e escala de estimativa"
                     chevron
                     onClick={() => setEditOpen(true)}
                  />
                  <SettingsRow
                     icon={<Network className="size-4" />}
                     title="Parent team"
                     description="Nest this team under another one (sub-team)"
                     trailing={<ParentTeamSelect team={team} disabled={!isAdmin} />}
                  />
                  <SettingsRow
                     icon={<Users className="size-4" />}
                     title="Members"
                     description="Gerenciar os membros do time"
                     trailing={
                        <span>
                           {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
                        </span>
                     }
                     chevron
                     onClick={() => router.push(`/${orgId}/team/${team.id}/members`)}
                  />
                  <SettingsRow
                     icon={<Zap className="size-4" />}
                     title="Slack notifications"
                     description="Configurar o Slack em Integrations"
                     chevron
                     onClick={() => router.push(`/${orgId}/settings/integrations`)}
                  />
               </SettingsCard>
            </SettingsSection>

            <SettingsSection title="Issues, projects, and docs">
               <SettingsCard>
                  <SettingsRow
                     icon={<Tag className="size-4" />}
                     title="Issue labels"
                     description="Labels disponíveis para as issues deste time"
                     trailing={<span>{labels.length} labels</span>}
                     chevron
                     onClick={() => router.push(`/${orgId}/settings/issue-labels`)}
                  />
                  <SettingsRow
                     icon={<FileText className="size-4" />}
                     title="Templates"
                     description="Templates de issue pré-preenchidos"
                     chevron
                     onClick={() => router.push(`/${orgId}/settings/issue-templates`)}
                  />
                  <SettingsRow
                     icon={<FileText className="size-4" />}
                     title="Documents"
                     description="Documentos e pastas do time"
                     chevron
                     onClick={() => router.push(`/${orgId}/team/${team.id}/documents`)}
                  />
               </SettingsCard>
            </SettingsSection>

            <SettingsSection title="Workflow">
               <SettingsCard>
                  <SettingsRow
                     icon={<Target className="size-4" />}
                     title="Issue statuses"
                     description="Os status pelos quais as issues passam"
                     trailing={<span>{status.length} statuses</span>}
                     chevron
                     onClick={() => router.push(`/${orgId}/settings/project-statuses`)}
                  />
                  <SettingsRow
                     icon={<Workflow className="size-4" />}
                     title="Workflows & automations"
                     description="SLAs por prioridade e regras de automação do time"
                     chevron
                     onClick={() => router.push(`/${orgId}/settings/teams/${team.id}/workflows`)}
                  />
                  <SettingsRow
                     icon={<CornerLeftUp className="size-4" />}
                     title="Auto-close parent issue"
                     description="Completing the last open sub-issue completes the parent"
                     trailing={
                        <AutoCloseToggle
                           team={team}
                           field="autoCloseParent"
                           label="Auto-close parent issue"
                           disabled={!isAdmin}
                        />
                     }
                  />
                  <SettingsRow
                     icon={<CornerRightDown className="size-4" />}
                     title="Auto-close sub-issues"
                     description="Completing the parent completes its remaining sub-issues"
                     trailing={
                        <AutoCloseToggle
                           team={team}
                           field="autoCloseChildren"
                           label="Auto-close sub-issues"
                           disabled={!isAdmin}
                        />
                     }
                  />
                  <SettingsRow
                     icon={<Radar className="size-4" />}
                     title="Triage"
                     description="A fila de entrada do time"
                     chevron
                     onClick={() => router.push(`/${orgId}/team/${team.id}/triage`)}
                  />
                  <SettingsRow
                     icon={<RefreshCcw className="size-4" />}
                     title="Cycles"
                     description="Janelas curtas de foco do time"
                     trailing={<span>{cycles.length} cycles</span>}
                     chevron
                     onClick={() => router.push(`/${orgId}/team/${team.id}/cycles`)}
                  />
               </SettingsCard>
            </SettingsSection>

            <SettingsSection title="Cycles">
               <SettingsCard>
                  <SettingsRow
                     icon={<Hourglass className="size-4" />}
                     title="Cool-down"
                     description="Dias entre o fim de um cycle e o início do próximo, sem cycle ativo (0–14)"
                     trailing={<CooldownDaysInput team={team} disabled={!isAdmin} />}
                  />
               </SettingsCard>
            </SettingsSection>

            <SettingsSection title="Agent">
               <SettingsCard>
                  <SettingsRow
                     icon={<Bot className="size-4" />}
                     title="Agent personalization"
                     description="Como os agentes devem trabalhar com você"
                     chevron
                     onClick={() => router.push(`/${orgId}/settings/agent-personalization`)}
                  />
               </SettingsCard>
            </SettingsSection>

            <SettingsSection
               title="Team hierarchy"
               description="Sub-times herdam o lugar na estrutura e aparecem aninhados na sidebar e em Teams."
            >
               <div role="group" aria-label="Team hierarchy">
                  <SettingsCard>
                     {parent && (
                        <SettingsRow
                           icon={<CornerLeftUp className="size-4" />}
                           title={parent.name}
                           description="Time pai"
                           chevron
                           onClick={() => router.push(`/${orgId}/settings/teams/${parent.id}`)}
                        />
                     )}
                     {children.length === 0 ? (
                        <SettingsRow
                           icon={<Network className="size-4" />}
                           title="No sub-teams yet"
                           description="Escolha um time pai em “Parent team” para aninhar um time aqui."
                           muted
                        />
                     ) : (
                        children.map((child) => (
                           <SettingsRow
                              key={child.id}
                              icon={<CornerRightDown className="size-4" />}
                              title={child.name}
                              description={`${child.members.length} ${
                                 child.members.length === 1 ? 'member' : 'members'
                              }`}
                              trailing={<span>{child.id}</span>}
                              chevron
                              onClick={() => router.push(`/${orgId}/settings/teams/${child.id}`)}
                           />
                        ))
                     )}
                  </SettingsCard>
               </div>
            </SettingsSection>

            <SettingsSection title="Danger zone">
               <SettingsCard>
                  <SettingsRow
                     title="Sair do time"
                     description="Remove você mesmo como membro deste time"
                     trailing={
                        <Button size="xs" variant="outline" onClick={() => setLeaveOpen(true)}>
                           Sair do time
                        </Button>
                     }
                  />
                  <SettingsRow
                     title="Excluir time"
                     description="Exclui permanentemente este time e todos os seus dados. Não pode ser desfeito."
                     muted
                     trailing={
                        <Button
                           size="xs"
                           variant="destructive"
                           disabled={!isAdmin}
                           title={isAdmin ? undefined : 'Apenas administradores'}
                           onClick={() => setDeleteOpen(true)}
                        >
                           Excluir…
                        </Button>
                     }
                  />
               </SettingsCard>
            </SettingsSection>
         </SettingsShell>

         <EditTeamDialog team={team} open={editOpen} onOpenChange={setEditOpen} />

         <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Sair de “{team.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     Você deixará de ser membro deste time. Pode solicitar entrada novamente depois.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(e) => {
                        e.preventDefault();
                        void leaveTeam();
                     }}
                     disabled={busy}
                  >
                     Sair do time
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <DeleteTeamDialog team={team} open={deleteOpen} onOpenChange={setDeleteOpen} />
      </>
   );
}
