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
import { useLabels, useStatuses } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   Bot,
   ChevronRight,
   FileText,
   Lock,
   Pencil,
   Radar,
   RefreshCcw,
   Repeat,
   Settings,
   Sparkles,
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
import { SettingsCard, SettingsRow, SettingsSection } from './shared';

interface TeamSettingsProps {
   teamId: string;
}

/** Edita nome + ícone (emoji) do time (admin). Persiste via PATCH /teams/[key]. */
function EditTeamDialog({
   team,
   open,
   onOpenChange,
}: {
   team: { id: string; name: string; icon: string | null };
   open: boolean;
   onOpenChange: (v: boolean) => void;
}) {
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const [busy, setBusy] = useState(false);
   const [name, setName] = useState(team.name);
   const [icon, setIcon] = useState(team.icon ?? '');

   useEffect(() => {
      if (open) {
         setName(team.name);
         setIcon(team.icon ?? '');
      }
   }, [open, team]);

   const save = async () => {
      if (!name.trim() || busy) return;
      setBusy(true);
      try {
         await api.teams.update(team.id, { name: name.trim(), icon: icon.trim() || null });
         await hydrate();
         onOpenChange(false);
         toast.success('Time atualizado');
      } catch {
         toast.error('Não foi possível atualizar o time');
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
                     onChange={(e) => setName(e.target.value)}
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-team-icon">Ícone (emoji)</Label>
                  <Input
                     id="edit-team-icon"
                     value={icon}
                     maxLength={4}
                     placeholder="📋"
                     onChange={(e) => setIcon(e.target.value)}
                  />
               </div>
            </div>
            <DialogFooter>
               <Button size="sm" onClick={() => void save()} disabled={busy || !name.trim()}>
                  Salvar
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Per-team settings page (general, workflow, AI and danger zone). */
export default function TeamSettings({ teamId }: TeamSettingsProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const teams = useWorkspaceStore((s) => s.teams);
   const me = useWorkspaceStore((s) => s.me);
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const getCyclesByTeam = useWorkspaceStore((s) => s.getCyclesByTeam);
   const status = useStatuses();
   const labels = useLabels();
   const team = teams.find((candidate) => candidate.id === teamId);

   const [editOpen, setEditOpen] = useState(false);
   const [leaveOpen, setLeaveOpen] = useState(false);
   const [deleteOpen, setDeleteOpen] = useState(false);
   const [confirmName, setConfirmName] = useState('');
   const [busy, setBusy] = useState(false);
   const isAdmin = me?.admin ?? false;

   if (!team) {
      return (
         <div className="max-w-2xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">Team not found</h1>
         </div>
      );
   }

   const cycles = getCyclesByTeam(team.id);

   const leaveTeam = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await api.teams.leave(team.id);
         await hydrate();
         toast.success('Você saiu do time');
         router.push(`/${orgId}`);
      } catch {
         toast.error('Não foi possível sair do time');
         setBusy(false);
      }
   };

   const deleteTeam = async () => {
      if (busy || confirmName !== team.name) return;
      setBusy(true);
      try {
         await api.teams.remove(team.id);
         await hydrate();
         toast.success('Time excluído');
         router.push(`/${orgId}`);
      } catch {
         toast.error('Não foi possível excluir o time');
         setBusy(false);
      }
   };

   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-2xl mx-auto px-6 py-10 pb-20">
            <div className="flex items-center gap-3">
               <span className="inline-flex size-9 bg-muted/50 items-center justify-center rounded-md text-lg">
                  {team.icon}
               </span>
               <div className="flex-1">
                  <h1 className="text-2xl font-medium">{team.name}</h1>
                  <p className="text-sm text-muted-foreground">
                     Accessible to all workspace members
                  </p>
               </div>
               {isAdmin && (
                  <Button
                     size="xs"
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
                  className="text-sm inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
               >
                  Team overview
                  <ChevronRight className="size-4" />
               </Link>
            </div>

            <div className="flex flex-col gap-10 mt-10">
               <SettingsSection>
                  <SettingsCard>
                     <SettingsRow
                        icon={<Settings className="size-4" />}
                        title="General"
                        description="Name, identifier, timezone, estimates, and broader settings"
                     />
                     <SettingsRow
                        icon={<Lock className="size-4" />}
                        title="Access and permissions"
                        description="Manage team access and who in the team can take certain actions"
                     />
                     <SettingsRow
                        icon={<Users className="size-4" />}
                        title="Members"
                        description="Manage team members"
                        trailing={<span>{team.members.length} members</span>}
                     />
                     <SettingsRow
                        icon={<Zap className="size-4" />}
                        title="Slack notifications"
                        description="Broadcast notifications to Slack"
                        trailing={<span>Off</span>}
                     />
                  </SettingsCard>
               </SettingsSection>

               <SettingsSection title="Issues, projects, and docs">
                  <SettingsCard>
                     <SettingsRow
                        icon={<Tag className="size-4" />}
                        title="Issue labels"
                        description="Labels available to this team's issues"
                        trailing={<span>{labels.length} labels</span>}
                     />
                     <SettingsRow
                        icon={<FileText className="size-4" />}
                        title="Templates"
                        description="Pre-filled templates for issues, documents, and projects"
                        trailing={<span>None</span>}
                     />
                     <SettingsRow
                        icon={<Repeat className="size-4" />}
                        title="Recurring issues"
                        description="Automatically create issues on a schedule"
                        trailing={<span>None</span>}
                     />
                  </SettingsCard>
               </SettingsSection>

               <SettingsSection title="Workflow">
                  <SettingsCard>
                     <SettingsRow
                        icon={<Target className="size-4" />}
                        title="Issue statuses"
                        description="Customize the statuses issues go through"
                        trailing={<span>{status.length} statuses</span>}
                     />
                     <SettingsRow
                        icon={<Workflow className="size-4" />}
                        title="Workflows & automations"
                        description="Manage issue automations, git workflows and other workflows"
                     />
                     <SettingsRow
                        icon={<Radar className="size-4" />}
                        title="Triage"
                        description="Streamline how you handle requests from outside your team"
                        trailing={<span>Enabled</span>}
                     />
                     <SettingsRow
                        icon={<RefreshCcw className="size-4" />}
                        title="Cycles"
                        description="Focus your team over short, time-boxed windows"
                        trailing={<span>{cycles.length > 0 ? 'Every 2 weeks' : 'Off'}</span>}
                     />
                  </SettingsCard>
               </SettingsSection>

               <SettingsSection title="AI & Agents">
                  <SettingsCard>
                     <SettingsRow
                        icon={<Bot className="size-4" />}
                        title="Team agents"
                        description="Add guidance for how agents should operate within this team"
                     />
                     <SettingsRow
                        icon={<Sparkles className="size-4" />}
                        title="Agent skills"
                        description="Agent skills shared with this team"
                        trailing={<span>None</span>}
                     />
                     <SettingsRow
                        icon={<RefreshCcw className="size-4" />}
                        title="Loops"
                        description="Automated agent workflows that run on a schedule or when an issue is updated"
                        trailing={<span>None</span>}
                     />
                     <SettingsRow
                        icon={<Zap className="size-4" />}
                        title="Project updates"
                        description="Automatically generate updates using recent activity and defined rules"
                     />
                     <SettingsRow
                        icon={<FileText className="size-4" />}
                        title="Resolved thread summaries"
                        description="Automatically generate summaries for resolved threads"
                     />
                  </SettingsCard>
               </SettingsSection>

               <SettingsSection
                  title="Team hierarchy"
                  description="Teams can be nested to reflect your team structure and to share workflows and settings."
               >
                  <div />
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
                              onClick={() => {
                                 setConfirmName('');
                                 setDeleteOpen(true);
                              }}
                           >
                              Excluir…
                           </Button>
                        }
                     />
                  </SettingsCard>
               </SettingsSection>
            </div>
         </div>

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

         <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Excluir “{team.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     Isso exclui o time e todas as suas issues, ciclos e dados. Esta ação NÃO pode
                     ser desfeita. Digite o nome do time para confirmar.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={team.name}
                  autoFocus
               />
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(e) => {
                        e.preventDefault();
                        void deleteTeam();
                     }}
                     disabled={busy || confirmName !== team.name}
                     className="bg-destructive text-white hover:bg-destructive/90"
                  >
                     Excluir permanentemente
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}
