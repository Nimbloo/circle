'use client';

import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/client';
import { useIssuesStore } from '@/store/issues-store';
import { Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

export type RelationKind = 'sub' | 'related' | 'blocked_by' | 'duplicate';

interface RelationEditorProps {
   issueId: string;
   kind: RelationKind;
   /** ids das issues já relacionadas (na direção issueId -> relatedId). */
   relatedIds: string[];
   /** Rótulo do botão de adicionar (ex.: "Add sub-issue"). */
   addLabel: string;
   /** Chamado após add/remove — o pai deve refetch o detail. */
   onChanged: () => void;
   /**
    * Renderiza a lista das issues relacionadas (default true). `false` = só o botão de
    * adicionar — usado em sub-issues, onde a lista já é exibida com um layout próprio,
    * mas `relatedIds` ainda filtra os candidatos do picker.
    */
   renderList?: boolean;
}

/**
 * Editor de relações de issue (sub / related / blocked_by): lista as issues
 * relacionadas com botão de remover e um picker (das issues do store) para
 * adicionar. Persiste via api.issues.addRelation/removeRelation.
 */
export function RelationEditor({
   issueId,
   kind,
   relatedIds,
   addLabel,
   onChanged,
   renderList = true,
}: RelationEditorProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const issues = useIssuesStore((s) => s.issues);
   const [open, setOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   const byId = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);
   const related = relatedIds.map((id) => byId.get(id)).filter((i) => i !== undefined);

   const candidates = useMemo(() => {
      const taken = new Set([...relatedIds, issueId]);
      return issues.filter((i) => !taken.has(i.id));
   }, [issues, relatedIds, issueId]);

   async function add(relatedId: string) {
      setOpen(false);
      setBusy(true);
      try {
         await api.issues.addRelation(issueId, relatedId, kind);
         onChanged();
      } catch {
         toast.error('Could not add the relation');
      } finally {
         setBusy(false);
      }
   }

   async function remove(relatedId: string) {
      setBusy(true);
      try {
         await api.issues.removeRelation(issueId, relatedId, kind);
         onChanged();
      } catch {
         toast.error('Could not remove the relation');
      } finally {
         setBusy(false);
      }
   }

   return (
      <div className="flex flex-col gap-1">
         {renderList &&
            related.map((issue) => (
               <div key={issue.id} className="group flex items-center gap-2 text-sm min-w-0">
                  <issue.status.icon />
                  <Link
                     href={`/${orgId ?? 'nimbloo'}/issue/${issue.identifier}`}
                     className="truncate hover:underline"
                  >
                     {issue.title}
                  </Link>
                  <button
                     type="button"
                     onClick={() => remove(issue.id)}
                     disabled={busy}
                     aria-label="Remove relation"
                     className="ml-auto shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground disabled:opacity-40"
                  >
                     <X className="size-3.5" />
                  </button>
               </div>
            ))}
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <button
                  type="button"
                  disabled={busy}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
               >
                  <Plus className="size-4" />
                  {addLabel}
               </button>
            </PopoverTrigger>
            <PopoverContent className="border-input w-72 p-0" align="start">
               <Command>
                  <CommandInput placeholder="Search issues..." />
                  <CommandList>
                     <CommandEmpty>No issues found.</CommandEmpty>
                     <CommandGroup>
                        {candidates.map((issue) => (
                           <CommandItem
                              key={issue.id}
                              value={`${issue.identifier} ${issue.title}`}
                              onSelect={() => add(issue.id)}
                              className="flex items-center gap-2"
                           >
                              <issue.status.icon />
                              <span className="text-muted-foreground text-xs shrink-0">
                                 {issue.identifier}
                              </span>
                              <span className="truncate">{issue.title}</span>
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>
      </div>
   );
}
