'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/client';
import { ApiError } from '@/lib/api/errors';
import type { InviteDto } from '@/lib/api/invites';
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
         const dto = await api.invites.create(value);
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
      <div className="border-b bg-container/50">
         <div className="flex items-center justify-between gap-3 px-6 py-3">
            <div className="min-w-0">
               <p className="text-sm font-medium">Convites</p>
               <p className="text-xs text-muted-foreground">
                  Para quem ainda não aparece aqui — inclusive quem nunca logou. O link vale 7 dias
                  e libera o acesso no primeiro login.
               </p>
            </div>
            <Popover open={open} onOpenChange={setOpen}>
               <PopoverTrigger asChild>
                  <Button size="xs" variant="secondary" className="shrink-0">
                     <Plus className="size-4 mr-1" />
                     Convidar
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="end" className="w-80 p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                     E-mail {DOMAIN} da pessoa. O link é copiado automaticamente.
                  </p>
                  <div className="flex items-center gap-1.5">
                     <Input
                        type="email"
                        autoFocus
                        placeholder={`nome${DOMAIN}`}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => {
                           if (e.key === 'Enter') void invited();
                        }}
                        className="h-8"
                     />
                     <Button size="xs" onClick={() => void invited()} disabled={busy}>
                        Convidar
                     </Button>
                  </div>
               </PopoverContent>
            </Popover>
         </div>

         {freshLink && (
            <div className="mx-6 mb-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
               <Link2 className="size-3.5 shrink-0 text-primary" />
               <span className="min-w-0 flex-1 truncate text-xs">
                  Convite de <span className="font-medium">{freshLink.email}</span> —{' '}
                  <span className="text-muted-foreground">{freshLink.url}</span>
               </span>
               <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 shrink-0"
                  aria-label="Copiar link"
                  onClick={() => void copy(freshLink.url)}
               >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
               </Button>
            </div>
         )}

         {pending.length > 0 && (
            <div className="pb-2">
               {pending.map((i) => (
                  <div
                     key={i.id}
                     className="flex items-center gap-3 px-6 py-2 text-sm hover:bg-accent/40 transition-colors"
                  >
                     <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-[10px] text-muted-foreground">
                        {i.email[0]?.toUpperCase()}
                     </span>
                     <span className="min-w-0 flex-1 truncate">{i.email}</span>
                     <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                        convidado por {i.invitedBy?.name ?? 'alguém'}
                     </span>
                     <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        pendente
                     </span>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 shrink-0"
                        aria-label={`Revogar convite de ${i.email}`}
                        disabled={busy}
                        onClick={() => void revoke(i.id, i.email)}
                     >
                        <X className="size-3.5" />
                     </Button>
                  </div>
               ))}
            </div>
         )}
      </div>
   );
}
