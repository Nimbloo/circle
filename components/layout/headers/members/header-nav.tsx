'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Convida um membro adicionando-o a um time via api.teams.addMember (não há rota
 * global de "invite" — membership é sempre por time) e re-hidrata o workspace.
 */
function InviteButton() {
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const teams = useWorkspaceStore((s) => s.teams);
   const [open, setOpen] = useState(false);
   const [teamId, setTeamId] = useState('');
   const [email, setEmail] = useState('');
   const [busy, setBusy] = useState(false);

   const invite = async () => {
      const team = teamId || teams[0]?.id || '';
      if (!team || !email.trim() || busy) return;
      setBusy(true);
      try {
         await api.teams.addMember(team, email.trim());
         await hydrate();
         setEmail('');
         setOpen(false);
         toast.success(`Invited ${email.trim()} to ${team}`);
      } catch {
         toast.error('Could not invite (e-mail inválido ou time inexistente)');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button className="relative" size="xs" variant="secondary">
               <Plus className="size-4" />
               Invite
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-72 p-3 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
               Membership é por time — escolha o time e o e-mail.
            </p>
            <Select value={teamId || teams[0]?.id || ''} onValueChange={setTeamId}>
               <SelectTrigger className="h-8">
                  <SelectValue placeholder="Team" />
               </SelectTrigger>
               <SelectContent>
                  {teams.map((t) => (
                     <SelectItem key={t.id} value={t.id}>
                        {t.name}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <Input
               type="email"
               placeholder="member@nimbloo.ai"
               value={email}
               onChange={(e) => setEmail(e.target.value)}
               onKeyDown={(e) => {
                  if (e.key === 'Enter') void invite();
               }}
               className="h-8"
            />
            <Button
               size="xs"
               onClick={() => void invite()}
               disabled={busy || !email.trim() || teams.length === 0}
               className="self-end"
            >
               Invite
            </Button>
         </PopoverContent>
      </Popover>
   );
}

export default function HeaderNav() {
   const users = useWorkspaceStore((s) => s.users);
   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger className="" />
            <div className="flex items-center gap-1">
               <span className="text-sm font-medium">Members</span>
               <span className="text-xs bg-accent rounded-md px-1.5 py-1">{users.length}</span>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <InviteButton />
         </div>
      </div>
   );
}
