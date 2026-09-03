'use client';

import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import type { Issue } from '@/data/issues';
import { adaptIssues } from '@/lib/adapters';
import { api } from '@/lib/client';
import { useIssuesStore } from '@/store/issues-store';
import { useEffect, useMemo, useState } from 'react';

interface IssuePickerProps {
   /** Ids que não podem ser escolhidos (a própria issue, filhas já vinculadas, ancestrais…). */
   excludeIds: Set<string>;
   onSelect: (issue: Issue) => void;
   placeholder?: string;
   /** Restringe os candidatos a um time (default: qualquer time). */
   teamId?: string;
}

/** Espera antes de bater no servidor enquanto o usuário digita. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * Picker de issue por identifier/título (#95): candidatos do `issues-store` (rápido,
 * já em memória) mais busca no servidor por `q` quando há texto — a issue procurada
 * pode não estar no store (outro time, board não hidratado, deep-link).
 */
export function IssuePicker({ excludeIds, onSelect, placeholder, teamId }: IssuePickerProps) {
   const storeIssues = useIssuesStore((s) => s.issues);
   const [query, setQuery] = useState('');
   const [remote, setRemote] = useState<Issue[]>([]);

   useEffect(() => {
      const q = query.trim();
      if (q.length < 2) {
         setRemote([]);
         return;
      }
      let active = true;
      const timer = setTimeout(() => {
         api.issues
            .list({ q, team: teamId, limit: 25 })
            .then((dtos) => {
               if (active) setRemote(adaptIssues(dtos));
            })
            .catch(() => {
               // sem servidor, ficam só os candidatos do store
            });
      }, SEARCH_DEBOUNCE_MS);
      return () => {
         active = false;
         clearTimeout(timer);
      };
   }, [query, teamId]);

   const candidates = useMemo(() => {
      const seen = new Set<string>();
      const out: Issue[] = [];
      for (const issue of [...storeIssues, ...remote]) {
         if (excludeIds.has(issue.id) || seen.has(issue.id)) continue;
         if (teamId && issue.teamId && issue.teamId !== teamId) continue;
         seen.add(issue.id);
         out.push(issue);
      }
      return out;
   }, [storeIssues, remote, excludeIds, teamId]);

   return (
      <Command>
         <CommandInput
            placeholder={placeholder ?? 'Search issues...'}
            value={query}
            onValueChange={setQuery}
         />
         <CommandList>
            <CommandEmpty>No issues found.</CommandEmpty>
            <CommandGroup>
               {candidates.map((issue) => (
                  <CommandItem
                     key={issue.id}
                     value={`${issue.identifier} ${issue.title}`}
                     onSelect={() => onSelect(issue)}
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
   );
}
