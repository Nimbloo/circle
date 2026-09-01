'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client';
import { ListSkeleton } from '@/components/common/list-skeleton';
import type { JoinRequestDto } from '@/lib/api/teams';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Check, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * Team Home — "Members" tab: membros do time, com adicionar e remover. Só entra no
 * picker quem JÁ é usuário do Circle (acesso concedido no Orbis + primeiro login por
 * SSO) — não há convite por e-mail aqui. Persiste via api.teams e re-hidrata o
 * workspace.
 */
export default function TeamMembers() {
   const { teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const isAdmin = useWorkspaceStore((s) => s.me?.admin ?? false);
   const loaded = useWorkspaceStore((s) => s.loaded);
   // Sem fallback `?? teams[0]`: id inválido deve dar not-found, não o primeiro time.
   const team = teams.find((t) => t.id === teamId);

   const [busy, setBusy] = useState(false);

   // Solicitações de entrada pendentes (só admin enxerga/decide).
   const [requests, setRequests] = useState<JoinRequestDto[]>([]);
   const refreshRequests = useCallback(async () => {
      if (!isAdmin || !teamId) {
         setRequests([]);
         return;
      }
      try {
         setRequests(await api.teams.joinRequests(teamId));
      } catch {
         /* silencioso — o painel só não popula */
      }
   }, [isAdmin, teamId]);
   useEffect(() => {
      void refreshRequests();
   }, [refreshRequests]);

   const decide = async (id: string, decision: 'approved' | 'denied') => {
      setBusy(true);
      try {
         await api.teams.decideJoinRequest(teamId, id, decision);
         await Promise.all([refreshRequests(), hydrate()]);
         toast.success(decision === 'approved' ? 'Solicitação aprovada' : 'Solicitação negada');
      } catch {
         toast.error('Não deu pra decidir a solicitação');
      } finally {
         setBusy(false);
      }
   };

   if (!team) {
      // Hidratando → skeleton; not-found só como estado final (fim do flash no deep-link frio).
      if (!loaded) {
         return (
            <div className="p-6">
               <ListSkeleton rows={5} />
            </div>
         );
      }
      return <div className="p-6 text-sm text-muted-foreground">Team not found.</div>;
   }

   const members = [...team.members].sort((a, b) => a.name.localeCompare(b.name));

   const removeMember = async (id: string, name: string) => {
      setBusy(true);
      try {
         await api.teams.removeMember(team.id, id);
         await hydrate();
         toast.success(`${name} removed from ${team.name}`);
      } catch {
         toast.error('Could not remove the member');
      } finally {
         setBusy(false);
      }
   };

   return (
      <div className="w-full">
         {isAdmin && requests.length > 0 && (
            <div className="mx-6 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
               <div className="px-4 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 border-b border-amber-500/20">
                  Solicitações de entrada ({requests.length})
               </div>
               {requests.map((r) => (
                  <div
                     key={r.id}
                     className="flex items-center gap-2.5 px-4 h-12 border-b border-amber-500/10 last:border-b-0 text-sm"
                  >
                     <Avatar className="size-6 shrink-0">
                        <AvatarImage src={r.user.avatarUrl || undefined} alt={r.user.name} />
                        <AvatarFallback>{r.user.name[0]}</AvatarFallback>
                     </Avatar>
                     <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-medium truncate">{r.user.name}</span>
                        <span className="text-xs text-muted-foreground truncate">
                           {r.user.email}
                        </span>
                     </div>
                     <Button
                        size="xs"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void decide(r.id, 'approved')}
                     >
                        <Check className="size-3.5" />
                        Aprovar
                     </Button>
                     <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void decide(r.id, 'denied')}
                     >
                        <X className="size-3.5" />
                        Negar
                     </Button>
                  </div>
               ))}
            </div>
         )}

         <div className="sticky top-0 z-10 flex h-8 pl-[18px] pr-[34px] items-center gap-1.5 border-b bg-container text-xs font-[450] leading-[normal] text-muted-foreground [&>*]:translate-y-[0.5px]">
            <div className="min-w-0 flex-1">Name</div>
            <div className="hidden w-[220px] md:block">Email</div>
            <div className="w-[174px]">Role</div>
         </div>

         {members.map((member) => (
            <div
               key={member.id}
               className="group flex h-[50px] pl-[18px] pr-[34px] w-full items-center gap-1.5 border-b border-border/30 text-sm hover:bg-accent/40"
            >
               <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar className="size-6 shrink-0">
                     <AvatarImage src={member.avatarUrl || undefined} alt={member.name} />
                     <AvatarFallback>{member.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                     <span className="truncate text-[13px] font-medium leading-4">
                        {member.name}
                     </span>
                     <span className="truncate text-xs font-medium leading-[15px] text-muted-foreground">
                        {member.name.split('.')[0]}
                     </span>
                  </div>
               </div>
               <div className="hidden w-[220px] truncate text-xs font-[450] leading-[normal] text-muted-foreground md:block">
                  {member.email}
               </div>
               <div className="flex w-[174px] items-center justify-between">
                  {/* Role é workspace-level e só editável na página Members — editar aqui
                      mudava a role GLOBAL do usuário (escalonamento silencioso). Aqui só
                      exibe a role atual (read-only). */}
                  <span className="rounded-md bg-accent px-2 py-1 text-xs text-muted-foreground">
                     {member.role}
                  </span>
                  {isAdmin && (
                     <button
                        type="button"
                        onClick={() => void removeMember(member.id, member.name)}
                        disabled={busy}
                        aria-label={`Remove ${member.name}`}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground disabled:opacity-40"
                     >
                        <X className="size-4" />
                     </button>
                  )}
               </div>
            </div>
         ))}
      </div>
   );
}
