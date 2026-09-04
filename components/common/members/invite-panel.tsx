'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/client';
import { ApiError } from '@/lib/api/errors';
import type { InviteDto } from '@/lib/api/invites';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';

/** Papéis convidáveis (#100) — espelha `INVITABLE_ROLES` do servidor. */
const INVITABLE_ROLES = ['Member', 'Guest'];
import { useWorkspaceStore } from '@/store/workspace-store';
import { Check, Copy, Link2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

const DOMAIN = '@nimbloo.ai';

/**
 * Convites pendentes + criação (só admin).
 *
 * O convite NÃO cria usuário: quem nunca logou não vira linha em `app_user` — foi
 * exatamente isso que gerava "membro fantasma" na lista e nos seletores de assignee.
 * Convidado aparece aqui, separado, e só entra na lista de membros quando logar.
 */
export function InvitePanel() {
   const isAdmin = useWorkspaceStore((s) => s.me?.admin ?? false);
   const [invites, setInvites] = useState<InviteDto[] | null>(null);
   const [email, setEmail] = useState('');
   /** Papel do convite (#100): Guest só enxerga os times de que virar membro. */
   const [role, setRole] = useState('Member');
   const [busy, setBusy] = useState(false);
   const [open, setOpen] = useState(false);
   /** Link do convite recém-criado — o token só volta uma vez, então fica na tela. */
   const [freshLink, setFreshLink] = useState<{ email: string; url: string } | null>(null);
   const [copied, setCopied] = useState(false);

   const refresh = useCallback(async () => {
      if (!isAdmin) {
         setInvites([]);
         return;
      }
      try {
         setInvites(await api.invites.list());
      } catch {
         setInvites([]);
      }
   }, [isAdmin]);

   useEffect(() => {
      void refresh();
   }, [refresh]);

   const copy = async (url: string) => {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setCopied(false), 1600);
   };

   const invited = async () => {
      const value = email.trim().toLowerCase();
      if (!value || busy) return;
      setBusy(true);
      try {
         const dto = await api.invites.create(value, role);
         setFreshLink({ email: dto.email, url: dto.url });
         setEmail('');
         setOpen(false);
         await refresh();
         await copy(dto.url);
      } catch (e) {
         const msg =
            e instanceof ApiError && (e.status === 400 || e.status === 409)
               ? e.message
               : 'Não foi possível criar o convite';
         toast.error(msg);
      } finally {
         setBusy(false);
      }
   };

   const revoke = async (id: string, who: string) => {
      setBusy(true);
      try {
         await api.invites.revoke(id);
         if (freshLink?.email === who) setFreshLink(null);
         await refresh();
         toast.success(`Convite de ${who} revogado`);
      } catch {
         toast.error('Não foi possível revogar');
      } finally {
         setBusy(false);
      }
   };

   if (!isAdmin) return null;

   const pending = (invites ?? []).filter((i) => !i.acceptedAt && !i.expired);

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               size="xs"
               variant="ghost"
               className="px-[9px] text-xs has-[>svg]:px-[9px]"
               aria-label="Invite members"
            >
               <Plus className="size-4" />
               Invite members
            </Button>
         </PopoverTrigger>
         <PopoverContent
            align="end"
            sideOffset={4}
            className="w-[360px] rounded-xl border-[var(--popover-border)] bg-popover p-0"
            style={{ boxShadow: 'var(--popover-shadow)' }}
         >
            <div className="p-3">
               <p className="mb-2 text-xs text-muted-foreground">
                  Enter a {DOMAIN} email. The invite link is copied automatically and expires in 7
                  days.
               </p>
               <div className="flex items-center gap-1.5">
                  <Input
                     type="email"
                     autoFocus
                     placeholder={`name${DOMAIN}`}
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void invited();
                     }}
                     className="h-8"
                  />
                  <Select value={role} onValueChange={setRole}>
                     <SelectTrigger aria-label="Invite role" className="h-8 w-[92px] text-xs">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {INVITABLE_ROLES.map((r) => (
                           <SelectItem key={r} value={r} className="text-xs">
                              {r}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                  <Button size="xs" onClick={() => void invited()} disabled={busy}>
                     Invite
                  </Button>
               </div>
            </div>

            {freshLink && (
               <div className="mx-3 mb-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <Link2 className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-xs">
                     Invite for <span className="font-medium">{freshLink.email}</span> —{' '}
                     <span className="text-muted-foreground">{freshLink.url}</span>
                  </span>
                  <Button
                     size="icon"
                     variant="ghost"
                     className="size-6 shrink-0"
                     aria-label="Copy invite link"
                     onClick={() => void copy(freshLink.url)}
                  >
                     {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </Button>
               </div>
            )}

            {pending.length > 0 && (
               <div className="border-t py-1">
                  <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                     Pending invites
                  </p>
                  {pending.map((i) => (
                     <div
                        key={i.id}
                        className="flex h-10 items-center gap-2 px-3 text-[13px] transition-colors hover:bg-accent/40"
                     >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-[10px] text-muted-foreground">
                           {i.email[0]?.toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{i.email}</span>
                        {i.role === 'Guest' && (
                           <span className="shrink-0 rounded border px-1 text-[10px] text-muted-foreground">
                              Guest
                           </span>
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground">
                           {i.invitedBy?.name ?? 'Unknown'}
                        </span>
                        <Button
                           size="icon"
                           variant="ghost"
                           className="size-6 shrink-0"
                           aria-label={`Revoke invite for ${i.email}`}
                           disabled={busy}
                           onClick={() => void revoke(i.id, i.email)}
                        >
                           <X className="size-3.5" />
                        </Button>
                     </div>
                  ))}
               </div>
            )}
         </PopoverContent>
      </Popover>
   );
}
