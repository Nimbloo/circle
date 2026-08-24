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
import { MEMBER_ROLES } from '@/lib/api/members';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Convite org-level (admin-only): cria/atualiza o app_user com a role escolhida
 * via api.members.invite (POST /members/invite) e re-hidrata o workspace. O
 * usuário define a senha depois via /signup. Membership por time segue no
 * Team Home (Add a member).
 */
function InviteButton() {
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const [open, setOpen] = useState(false);
   const [email, setEmail] = useState('');
   const [role, setRole] = useState<string>('Member');
   const [busy, setBusy] = useState(false);

   const invite = async () => {
      const value = email.trim().toLowerCase();
      if (!value || busy) return;
      setBusy(true);
      try {
         const res = (await api.members.invite(value, role)) as {
            inviteUrl?: string;
            alreadyRegistered?: boolean;
         };
         await hydrate();
         setEmail('');
         setOpen(false);
         if (res?.alreadyRegistered) {
            toast.info(`${value} já é membro — role atualizada para ${role}`);
         } else if (res?.inviteUrl) {
            // Mailer indisponível: o backend devolve o link de signup pro admin
            // entregar. Sem isto o link era perdido silenciosamente.
            void navigator.clipboard.writeText(res.inviteUrl).catch(() => undefined);
            toast.success(`Convite criado — link de acesso copiado (envie a ${value})`, {
               duration: 8000,
            });
         } else {
            toast.success(`Invited ${value} as ${role}`);
         }
      } catch {
         toast.error('Could not invite (e-mail inválido ou sem permissão)');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button className="relative" size="xs" variant="secondary">
               <Plus className="size-4" />
               Convidar
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-72 p-3 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
               Convide por e-mail com uma role — o usuário define a senha no primeiro acesso.
            </p>
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
            <Select value={role} onValueChange={setRole}>
               <SelectTrigger className="h-8">
                  <SelectValue placeholder="Role" />
               </SelectTrigger>
               <SelectContent>
                  {MEMBER_ROLES.map((r) => (
                     <SelectItem key={r} value={r}>
                        {r}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <Button
               size="xs"
               onClick={() => void invite()}
               disabled={busy || !email.trim()}
               className="self-end"
            >
               Convidar
            </Button>
         </PopoverContent>
      </Popover>
   );
}

export default function HeaderNav() {
   const users = useWorkspaceStore((s) => s.users);
   const isAdmin = useWorkspaceStore((s) => s.me?.admin ?? false);
   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger className="" />
            <div className="flex items-center gap-1">
               <span className="text-sm font-medium">Members</span>
               <span className="text-xs bg-accent rounded-md px-1.5 py-1">{users.length}</span>
            </div>
         </div>
         <div className="flex items-center gap-2">{isAdmin && <InviteButton />}</div>
      </div>
   );
}
