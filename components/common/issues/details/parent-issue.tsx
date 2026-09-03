'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Issue } from '@/data/issues';
import { api } from '@/lib/client';
import { useIssuesStore } from '@/store/issues-store';
import { ChevronDown, CornerLeftUp, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { IssuePicker } from './issue-picker';

/**
 * Persiste o pai de `childId` (#95): pelo store (otimista + rollback + toast de erro)
 * quando a filha está no board; direto na API quando é deep-link frio. Resolve `true`
 * quando a API confirmou — o chamador só refetcha/toasta sucesso depois disso.
 */
export function useSetParent() {
   return useCallback(async (childId: string, parentId: string | null): Promise<boolean> => {
      const store = useIssuesStore.getState();
      try {
         if (store.getIssueById(childId)) {
            await store.updateIssue(childId, { parentId });
         } else {
            await api.issues.update(childId, { parentId });
         }
         return true;
      } catch {
         // O store já toastou o erro no caminho otimista; o caminho direto toasta aqui.
         if (!store.getIssueById(childId)) toast.error('Could not update the parent issue');
         return false;
      }
   }, []);
}

/**
 * Ids que não podem virar pai de `issueId`: a própria issue e as descendentes conhecidas
 * no store (o servidor ainda é a guarda final contra ciclo, com 400).
 */
export function useParentCandidatesExclusion(issueId: string, extra: string[] = []) {
   const issues = useIssuesStore((s) => s.issues);
   // Chave estável: o chamador costuma passar um array novo a cada render.
   const extraKey = extra.join(',');
   return useMemo(() => {
      const excluded = new Set<string>([issueId, ...(extraKey ? extraKey.split(',') : [])]);
      const queue = [issueId];
      while (queue.length) {
         const cur = queue.shift()!;
         for (const i of issues) {
            if (i.parentId === cur && !excluded.has(i.id)) {
               excluded.add(i.id);
               queue.push(i.id);
            }
         }
      }
      return excluded;
   }, [issues, issueId, extraKey]);
}

/** Dialog com o picker de issue — usado pelo menu do header ("Convert to sub-issue of…"). */
export function ParentIssuePickerDialog({
   open,
   onOpenChange,
   issueId,
   onSelect,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   issueId: string;
   onSelect: (parent: Issue) => void;
}) {
   const excludeIds = useParentCandidatesExclusion(issueId);
   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="p-0 sm:max-w-md gap-0 overflow-hidden">
            <DialogHeader className="px-4 pt-4 pb-2">
               <DialogTitle className="text-sm">Convert to sub-issue of…</DialogTitle>
            </DialogHeader>
            <IssuePicker
               excludeIds={excludeIds}
               placeholder="Search parent issue..."
               onSelect={(parent) => {
                  onOpenChange(false);
                  onSelect(parent);
               }}
            />
         </DialogContent>
      </Dialog>
   );
}

/**
 * Propriedade "Parent" da sidebar (#95): chip com identifier + título do pai (link) e
 * menu "Change parent" / "Remove parent"; sem pai, botão "Set parent". A troca abre o
 * picker (store + busca no servidor).
 */
export function ParentIssueProperty({
   issue,
   parent,
   onChanged,
}: {
   issue: Issue;
   parent: { id: string; identifier: string; title: string } | null;
   onChanged?: () => void;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const setParent = useSetParent();
   const excludeIds = useParentCandidatesExclusion(issue.id, parent ? [parent.id] : []);
   const [pickerOpen, setPickerOpen] = useState(false);

   const apply = async (parentId: string | null) => {
      setPickerOpen(false);
      if (await setParent(issue.id, parentId)) onChanged?.();
   };

   const picker = (
      <PopoverContent className="border-input w-80 p-0" align="start">
         <IssuePicker
            excludeIds={excludeIds}
            placeholder="Search parent issue..."
            onSelect={(candidate) => void apply(candidate.id)}
         />
      </PopoverContent>
   );

   if (!parent) {
      return (
         <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
               <button
                  type="button"
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
               >
                  <Plus className="size-4" />
                  Set parent
               </button>
            </PopoverTrigger>
            {picker}
         </Popover>
      );
   }

   return (
      <div className="flex items-center gap-1 min-w-0">
         <Link
            href={`/${orgId ?? 'nimbloo'}/issue/${parent.identifier}`}
            className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent/40 transition-colors"
            data-testid="parent-issue-property"
         >
            <CornerLeftUp className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
               {parent.identifier}
            </span>
            <span className="truncate">{parent.title}</span>
         </Link>
         <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <button
                     type="button"
                     aria-label="Parent actions"
                     className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                  >
                     <ChevronDown className="size-3.5" />
                  </button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
                     Change parent
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void apply(null)}>
                     Remove parent
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
            {/* Âncora invisível: o popover do picker abre alinhado ao chip. */}
            <PopoverTrigger asChild>
               <span className="sr-only" aria-hidden />
            </PopoverTrigger>
            {picker}
         </Popover>
      </div>
   );
}
