'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/client';
import type { JoinRequestDto } from '@/lib/api/teams';
import { RoleControl } from '@/components/common/members/role-control';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Check, Plus, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * Team Home — "Members" tab: membros do time, com adicionar (por e-mail,
 * provisiona o usuário) e remover. Persiste via api.teams e re-hidrata o
 * workspace.
 */
export default function TeamMembers() {
   const { teamId } = useParams<{ orgId: string; teamId: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const isAdmin = useWorkspaceStore((s) => s.me?.admin ?? false);
   const team = teams.find((t) => t.id === teamId) ?? teams[0];

   const [open, setOpen] = useState(false);
   const [email, setEmail] = useState('');
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
      return <div className="p-6 text-sm text-muted-foreground">Team not found.</div>;
   }

   const members = [...team.members].sort((a, b) => a.name.localeCompare(b.name));

   const addMember = async () => {
      const value = email.trim().toLowerCase();
      if (!value || busy) return;
      setBusy(true);
      try {
         await api.teams.addMember(team.id, value);
         await hydrate();
         setEmail('');
         setOpen(false);
         toast.success(`${value} added to ${team.name}`);
      } catch {
         toast.error('Could not add the member');
      } finally {
         setBusy(false);
      }
   };

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
         <div className="flex items-center justify-between px-6 py-3">
            <span className="text-sm text-muted-foreground font-medium">Name ↓</span>
            <div className="flex items-center gap-2">
               {isAdmin && (
                  <Popover open={open} onOpenChange={setOpen}>
                     <PopoverTrigger asChild>
                        <Button size="xs" variant="secondary">
                           <Plus className="size-4 mr-1" />
                           Add a member
                        </Button>
                     </PopoverTrigger>
                     <PopoverContent align="end" className="w-72 p-3">
                        <p className="text-xs text-muted-foreground mb-2">
                           Add by email (the user is provisioned if new).
                        </p>
                        <div className="flex items-center gap-1.5">
                           <Input
                              type="email"
                              placeholder="name@nimbloo.ai"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              onKeyDown={(e) => {
                                 if (e.key === 'Enter') void addMember();
                              }}
                              className="h-8"
                           />
                           <Button size="xs" onClick={() => void addMember()} disabled={busy}>
                              Add
                           </Button>
                        </div>
                     </PopoverContent>
                  </Popover>
               )}
            </div>
         </div>

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

         <div className="bg-container px-6 py-1.5 text-sm flex items-center text-muted-foreground border-b sticky top-0 z-10">
            <div className="w-[55%] md:w-[45%]">Name</div>
            <div className="hidden md:block md:w-[35%]">Email</div>
            <div className="w-[45%] md:w-[20%]">Role</div>
         </div>

         {members.map((member) => (
            <div
               key={member.id}
               className="group w-full flex items-center px-6 h-12 hover:bg-sidebar/50 border-b border-border/30 text-sm"
            >
               <div className="w-[55%] md:w-[45%] flex items-center gap-2.5 min-w-0">
                  <Avatar className="size-6 shrink-0">
                     <AvatarImage src={member.avatarUrl || undefined} alt={member.name} />
                     <AvatarFallback>{member.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                     <span className="font-medium truncate">{member.name}</span>
                     <span className="text-xs text-muted-foreground truncate">
                        {member.name.split('.')[0]}
                     </span>
                  </div>
               </div>
               <div className="hidden md:block md:w-[35%] text-muted-foreground truncate">
                  {member.email}
               </div>
               <div className="w-[45%] md:w-[20%] flex items-center justify-between">
                  <RoleControl
                     userId={member.id}
                     role={member.role}
                     className="text-xs px-2 py-1 rounded-md bg-accent text-muted-foreground"
                  />
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
