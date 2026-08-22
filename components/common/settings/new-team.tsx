'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { TeamDto } from '@/lib/api/teams';
import { Check, Clock } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** "Join or create a team" settings page. */
export default function NewTeam() {
   const hydrate = useWorkspaceStore((s) => s.hydrate);

   // Fonte autoritativa: a API traz `joined` + `requested` + contagens (o store adaptado
   // não carrega o `requested`). Settings não é hot-path — um fetch dedicado é ok e correto.
   const [teams, setTeams] = useState<TeamDto[]>([]);
   const notJoined = teams.filter((t) => !t.joined);

   const refresh = useCallback(async () => {
      try {
         setTeams(await api.teams.list());
      } catch {
         /* silencioso — a seção só não popula */
      }
   }, []);
   useEffect(() => {
      void refresh();
   }, [refresh]);

   const [key, setKey] = useState('');
   const [name, setName] = useState('');
   const [busy, setBusy] = useState(false);
   const [pendingId, setPendingId] = useState<string | null>(null);

   const create = async () => {
      const id = key.trim().toUpperCase();
      if (!id || !name.trim() || busy) return;
      setBusy(true);
      try {
         await api.teams.create({ id, name: name.trim() });
         await Promise.all([hydrate(), refresh()]);
         setKey('');
         setName('');
         toast.success(`Time ${id} criado — você já é membro`);
      } catch {
         toast.error('Não deu pra criar o time (key inválida ou já existe)');
      } finally {
         setBusy(false);
      }
   };

   const requestJoin = async (team: TeamDto) => {
      if (pendingId) return;
      setPendingId(team.id);
      try {
         await api.teams.requestJoin(team.id);
         await refresh();
         toast.success(`Solicitação enviada para ${team.name} — aguarde aprovação`);
      } catch {
         toast.error('Não deu pra solicitar entrada');
      } finally {
         setPendingId(null);
      }
   };

   return (
      <SettingsShell
         title="Entrar ou criar um time"
         description="Times organizam issues, ciclos e projetos em torno das pessoas que trabalham juntas"
      >
         <SettingsSection title="Criar um novo time">
            <SettingsCard>
               <div className="flex items-center gap-3 p-4">
                  <Input
                     placeholder="Key, ex.: CORE"
                     value={key}
                     onChange={(e) => setKey(e.target.value.toUpperCase())}
                     maxLength={16}
                     className="h-8 w-32"
                  />
                  <Input
                     placeholder="Nome do time, ex.: Mobile"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void create();
                     }}
                     className="h-8 flex-1"
                  />
                  <Button
                     size="xs"
                     onClick={() => void create()}
                     disabled={busy || !key.trim() || !name.trim()}
                  >
                     Criar time
                  </Button>
               </div>
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Entrar num time existente">
            <SettingsCard>
               {notJoined.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                     {teams.length === 0
                        ? 'Nenhum time ainda — crie o primeiro acima.'
                        : 'Você já faz parte de todos os times.'}
                  </div>
               ) : (
                  notJoined.map((team) => (
                     <SettingsRow
                        key={team.id}
                        icon={<span className="text-sm">{team.icon}</span>}
                        title={team.name}
                        description={`${team.memberCount} membros · ${team.projectCount} projetos`}
                        trailing={
                           team.requested ? (
                              <Button size="xs" variant="secondary" disabled>
                                 <Clock className="size-3.5" />
                                 Solicitado
                              </Button>
                           ) : (
                              <Button
                                 size="xs"
                                 variant="secondary"
                                 disabled={pendingId === team.id}
                                 onClick={() => void requestJoin(team)}
                              >
                                 <Check className="size-3.5" />
                                 Solicitar entrada
                              </Button>
                           )
                        }
                     />
                  ))
               )}
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
