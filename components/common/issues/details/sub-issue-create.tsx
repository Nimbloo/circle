'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/client';
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';

/**
 * Criação inline de sub-issue (paridade Linear): cria uma issue nova no mesmo time
 * (e projeto) da pai, com defaults 'to-do'/'no-priority', e a vincula como filha
 * (relação `sub`). Insere no issues-store (applyRemote) p/ aparecer na lista, e
 * dispara onCreated (refetch do detalhe → atualiza subIssueIds/rollup).
 */
export function SubIssueCreate({
   parentId,
   teamId,
   projectId,
   onCreated,
}: {
   parentId: string;
   teamId?: string;
   projectId?: string | null;
   onCreated: () => void;
}) {
   const [open, setOpen] = useState(false);
   const [title, setTitle] = useState('');
   const [busy, setBusy] = useState(false);

   const submit = async () => {
      const t = title.trim();
      if (!t || busy) return;
      if (!teamId) {
         toast.error('Sem time para criar a sub-issue');
         return;
      }
      setBusy(true);
      try {
         const dto = await api.issues.create({
            teamId,
            title: t,
            statusId: 'to-do',
            priorityId: 'no-priority',
            projectId: projectId ?? null,
         });
         await api.issues.addRelation(parentId, dto.id, 'sub');
         await useIssuesStore.getState().applyRemote(dto.id);
         setTitle('');
         setOpen(false);
         onCreated();
      } catch {
         toast.error('Falha ao criar sub-issue');
      } finally {
         setBusy(false);
      }
   };

   if (!open) {
      return (
         <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 h-8 px-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
         >
            <Plus className="size-4" />
            Create sub-issue
         </button>
      );
   }

   return (
      <input
         autoFocus
         value={title}
         disabled={busy}
         onChange={(e) => setTitle(e.target.value)}
         onBlur={() => {
            if (!title.trim()) setOpen(false);
         }}
         onKeyDown={(e) => {
            if (e.key === 'Enter') {
               e.preventDefault();
               void submit();
            } else if (e.key === 'Escape') {
               setTitle('');
               setOpen(false);
            }
         }}
         placeholder="Sub-issue title…"
         className="w-full h-8 px-1 text-sm bg-transparent outline-none border-b border-border/50 placeholder:text-muted-foreground/70 disabled:opacity-50"
      />
   );
}
