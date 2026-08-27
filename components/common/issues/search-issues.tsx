'use client';

import type { Issue } from '@/data/issues';
import { api } from '@/lib/client';
import { adaptIssues } from '@/lib/adapters';
import { useSearchStore } from '@/store/search-store';
import { useEffect, useState } from 'react';
import { IssueLine } from './issue-line';

/**
 * Busca dedicada — usa a busca SERVER-SIDE (api.issues.list({ q })), que casa
 * título, identifier, descrição E comentários. Antes filtrava só o store local
 * (título/identifier), então descrição/comentário nunca eram alcançados aqui.
 */
export function SearchIssues() {
   const [searchResults, setSearchResults] = useState<Issue[]>([]);
   const [loading, setLoading] = useState(false);
   const { searchQuery, isSearchOpen } = useSearchStore();

   useEffect(() => {
      const q = searchQuery.trim();
      if (q === '') {
         setSearchResults([]);
         return;
      }
      let active = true;
      setLoading(true);
      // Debounce: evita uma request por tecla digitada.
      const t = setTimeout(() => {
         api.issues
            .list({ q })
            .then((dtos) => {
               if (active) setSearchResults(adaptIssues(dtos));
            })
            .catch(() => {
               if (active) setSearchResults([]);
            })
            .finally(() => {
               if (active) setLoading(false);
            });
      }, 250);
      return () => {
         active = false;
         clearTimeout(t);
      };
   }, [searchQuery]);

   if (!isSearchOpen) {
      return null;
   }

   return (
      <div className="w-full">
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
