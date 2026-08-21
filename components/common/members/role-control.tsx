'use client';

import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/client';
import { MEMBER_ROLES } from '@/lib/api/members';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Controle de role de um membro. Admin (me.admin) edita via Select
 * (api.members.updateRole → re-hidrata o workspace); não-admin vê texto estático.
 */
export function RoleControl({
   userId,
   role,
   className,
}: {
   userId: string;
   role: string;
   className?: string;
}) {
   const isAdmin = useWorkspaceStore((s) => s.me?.admin ?? false);
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const [busy, setBusy] = useState(false);

   if (!isAdmin) {
      return <span className={className}>{role}</span>;
   }

   const onChange = async (next: string) => {
      if (next === role || busy) return;
      setBusy(true);
      try {
         await api.members.updateRole(userId, next);
         await hydrate();
         toast.success(`Role updated to ${next}`);
      } catch {
         toast.error('Could not update the role');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Select value={role} onValueChange={(v) => void onChange(v)} disabled={busy}>
         <SelectTrigger className={className ?? 'h-7 w-32 text-xs'}>
            <SelectValue />
         </SelectTrigger>
         <SelectContent>
            {MEMBER_ROLES.map((r) => (
               <SelectItem key={r} value={r} className="text-xs">
                  {r}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   );
}
