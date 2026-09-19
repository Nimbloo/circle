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
 * Teto de linhas renderizadas (is#9): o store tem milhares de issues e o cmdk renderizava
 * todas (long task de ~450 ms ao abrir e a cada tecla). A busca filtra antes de cortar.
 */
const MAX_CANDIDATES = 50;

/** Minúsculas e sem acento — "numero" acha "número". */
function fold(text: string): string {
   return text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
}

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
      const terms = fold(query.trim()).split(/\s+/).filter(Boolean);
      const matches = (issue: Issue) => {
         if (terms.length === 0) return true;
         const hay = fold(`${issue.identifier} ${issue.title}`);
         return terms.every((t) => hay.includes(t));
      };
      const seen = new Set<string>();
      const out: Issue[] = [];
      // Identifier exato primeiro ("ENG-12" não pode perder para "ENG-120").
      const exact = query.trim().toUpperCase();
      const exactHit = exact
         ? (remote.find((i) => i.identifier === exact) ??
           storeIssues.find((i) => i.identifier === exact))
         : undefined;
      const ordered = exactHit ? [exactHit, ...remote, ...storeIssues] : [...remote, ...storeIssues];
      for (const issue of ordered) {
         if (out.length >= MAX_CANDIDATES) break;
         if (excludeIds.has(issue.id) || seen.has(issue.id)) continue;
         if (teamId && issue.teamId && issue.teamId !== teamId) continue;
         // O servidor já filtrou os remotos (busca por conteúdo); o store filtra aqui.
         if (issue !== exactHit && !remote.includes(issue) && !matches(issue)) continue;
         seen.add(issue.id);
         out.push(issue);
      }
      return out;
   }, [storeIssues, remote, excludeIds, teamId, query]);

   // A filtragem é nossa (acima, com teto): o filtro interno do cmdk refaria a busca
   // sobre a lista e esconderia os resultados do servidor que casam por conteúdo.
   return (
      <Command shouldFilter={false}>
         <CommandInput
            placeholder={placeholder ?? 'Buscar issues...'}
            value={query}
            onValueChange={setQuery}
         />
         <CommandList>
            <CommandEmpty>Nenhuma issue encontrada.</CommandEmpty>
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
