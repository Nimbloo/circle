'use client';

import { api } from '@/lib/client';
import { useIssuesStore } from '@/store/issues-store';
import { useSearchStore } from '@/store/search-store';
import { useEffect, useMemo, useState } from 'react';
import { BulkActionsBar } from './bulk-actions-bar';
import { IssueLine } from './issue-line';

/**
 * Busca dedicada — usa a busca SERVER-SIDE (api.issues.list({ q })), que casa
 * título, identifier, descrição E comentários. Antes filtrava só o store local
 * (título/identifier), então descrição/comentário nunca eram alcançados aqui.
 *
 * O servidor devolve só os IDS relevantes; a linha renderiza a issue do `issues-store`
 * (mesmo padrão do ⌘K), então a edição inline (status, prioridade, assignee…) reflete e
 * persiste como em qualquer lista. Resultado que ainda não está no store entra por
 * `applyRemote` (upsert), sem re-hidratar tudo.
 */
export function SearchIssues() {
   const [resultIds, setResultIds] = useState<string[]>([]);
   const [loading, setLoading] = useState(false);
   const { searchQuery, isSearchOpen } = useSearchStore();
   const issues = useIssuesStore((s) => s.issues);
   const applyRemote = useIssuesStore((s) => s.applyRemote);

   useEffect(() => {
      const q = searchQuery.trim();
      if (q === '') {
         setResultIds([]);
         return;
      }
      let active = true;
      setLoading(true);
      // Debounce: evita uma request por tecla digitada.
      const t = setTimeout(() => {
         api.issues
            .list({ q })
            .then((dtos) => {
               if (!active) return;
               setResultIds(dtos.map((d) => d.id));
               const known = new Set(useIssuesStore.getState().issues.map((i) => i.id));
               dtos.filter((d) => !known.has(d.id)).forEach((d) => void applyRemote(d.id));
            })
            .catch(() => {
               if (active) setResultIds([]);
            })
            .finally(() => {
               if (active) setLoading(false);
            });
      }, 250);
      return () => {
         active = false;
         clearTimeout(t);
      };
   }, [searchQuery, applyRemote]);

   // Ordem do servidor (relevância), resolvida contra o store vivo.
   const searchResults = useMemo(() => {
      const byId = new Map(issues.map((issue) => [issue.id, issue]));
      return resultIds.map((id) => byId.get(id)).filter((issue) => issue !== undefined);
   }, [resultIds, issues]);

   if (!isSearchOpen) {
      return null;
   }

   return (
      <div className="w-full">
         <BulkActionsBar />
         {searchQuery.trim() !== '' && (
            <div>
               {searchResults.length > 0 ? (
                  <div className="border rounded-md mt-4">
                     <div className="py-2 px-4 border-b bg-muted/50">
                        <h3 className="text-sm font-medium">Results ({searchResults.length})</h3>
                     </div>
                     <div className="divide-y">
                        {searchResults.map((issue) => (
                           <IssueLine key={issue.id} issue={issue} layoutId={false} />
                        ))}
                     </div>
                  </div>
               ) : (
                  <div className="text-center py-8 text-muted-foreground">
                     {loading ? 'Searching…' : `No results found for "${searchQuery}"`}
                  </div>
               )}
            </div>
         )}
      </div>
   );
}
