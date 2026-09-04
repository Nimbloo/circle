'use client';

import { MoreHorizontal, UserMinus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/client';
import type { User } from '@/data/users';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Menu do membro na lista (#100): Deactivate / Reactivate, só para admin.
 *
 * A confirmação é INLINE dentro do próprio menu (padrão Linear) — desativar remove a
 * pessoa de todos os times e a tranca fora do login, então não pode ser um clique
 * solto. Toast de sucesso só depois que a API confirma.
 */
export function MemberActions({ user }: { user: User }) {
   const isAdmin = useWorkspaceStore((s) => s.me?.admin ?? false);
   const meId = useWorkspaceStore((s) => s.me?.id);
   const applyUser = useWorkspaceStore((s) => s.applyUser);
   const [open, setOpen] = useState(false);
   const [confirming, setConfirming] = useState(false);
   const [busy, setBusy] = useState(false);

   // Auto-desativação travaria o próprio admin fora — o servidor também recusa.
   if (!isAdmin || user.id === meId || user.role === 'Application') return null;

   const deactivated = Boolean(user.deactivatedAt);

   const commit = async (next: boolean) => {
      if (busy) return;
      setBusy(true);
      try {
         applyUser(await api.members.setDeactivated(user.id, next));
         toast.success(next ? 'Membro desativado' : 'Membro reativado');
         setOpen(false);
         setConfirming(false);
      } catch {
         toast.error(
            next ? 'Não foi possível desativar o membro' : 'Não foi possível reativar o membro'
         );
      } finally {
         setBusy(false);
      }
   };

   return (
      <DropdownMenu
         open={open}
         onOpenChange={(next) => {
            setOpen(next);
            if (!next) setConfirming(false);
         }}
      >
         <DropdownMenuTrigger asChild>
            <Button
               type="button"
               size="icon"
               variant="ghost"
               className="size-7"
               aria-label={`Actions for ${user.name}`}
               onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
               }}
            >
               <MoreHorizontal className="size-4" />
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="w-56">
            {deactivated ? (
               <DropdownMenuItem
                  disabled={busy}
                  onSelect={(e) => {
                     e.preventDefault();
                     void commit(false);
                  }}
               >
                  <UserPlus className="size-4" />
                  Reactivate
               </DropdownMenuItem>
            ) : confirming ? (
               <div className="flex flex-col gap-2 px-2 py-1.5">
                  <p className="text-xs text-muted-foreground">
                     Remove {user.name} de todos os times e bloqueia o login. O histórico é mantido.
                  </p>
                  <div className="flex justify-end gap-2">
                     <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setConfirming(false)}
                     >
                        Cancel
                     </Button>
                     <Button
                        size="xs"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void commit(true)}
                     >
                        Deactivate
                     </Button>
                  </div>
               </div>
            ) : (
               <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                     e.preventDefault();
                     setConfirming(true);
                  }}
               >
                  <UserMinus className="size-4" />
                  Deactivate
               </DropdownMenuItem>
            )}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
