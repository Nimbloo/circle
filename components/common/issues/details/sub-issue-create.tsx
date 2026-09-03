'use client';

import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/client';
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';

/**
 * Criação inline de sub-issue (paridade Linear, #95): `api.issues.create({ parentId })`
 * cria a filha JÁ vinculada, herdando time/prioridade/projeto do pai no servidor.
 * Enter cria e mantém o input aberto e focado para a próxima; colar várias linhas
 * cria uma sub-issue por linha; Esc fecha. Insere no issues-store (applyRemote) e
 * dispara onCreated (refetch do detalhe → lista de filhas + rollup).
 */
export function SubIssueCreate({
   parentId,
   onCreated,
}: {
   parentId: string;
   onCreated: () => void;
}) {
   const [open, setOpen] = useState(false);
   const [title, setTitle] = useState('');
   const [busy, setBusy] = useState(false);
   const inputRef = useRef<HTMLInputElement>(null);

   const createMany = async (titles: string[]) => {
      const clean = titles.map((t) => t.trim()).filter(Boolean);
      if (clean.length === 0 || busy) return;
      setBusy(true);
      let created = 0;
      try {
         // Sequencial de propósito: mantém a ordem das linhas coladas (rank = append).
         for (const t of clean) {
            const dto = await api.issues.create({ parentId, title: t });
            created += 1;
            void useIssuesStore.getState().applyRemote(dto.id);
         }
         setTitle('');
         onCreated();
         if (clean.length > 1) toast.success(`${created} sub-issues created`);
      } catch {
         if (created > 0) onCreated();
         toast.error(
            created > 0
               ? `Created ${created} of ${clean.length} sub-issues`
               : 'Could not create the sub-issue'
         );
      } finally {
         setBusy(false);
         // Enter mantém o fluxo: foco de volta no input para a próxima sub-issue.
         requestAnimationFrame(() => inputRef.current?.focus());
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
         ref={inputRef}
         autoFocus
         value={title}
         disabled={busy}
         aria-label="Sub-issue title"
         onChange={(e) => setTitle(e.target.value)}
         onPaste={(e) => {
            // 'text' é o alias de 'text/plain' nos browsers (e o único que o user-event preenche).
            const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
            const lines = text.split(/\r?\n/).filter((l) => l.trim());
            if (lines.length <= 1) return; // colar de uma linha segue o fluxo normal do input
            e.preventDefault();
            void createMany(lines);
         }}
         onBlur={() => {
            if (!title.trim() && !busy) setOpen(false);
         }}
         onKeyDown={(e) => {
            if (e.key === 'Enter') {
               e.preventDefault();
               void createMany([title]);
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
