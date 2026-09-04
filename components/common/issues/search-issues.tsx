'use client';

import { api, type SearchGroup, type SearchItem, type SearchEntityType } from '@/lib/client';
import { useIssuesStore } from '@/store/issues-store';
import { useSearchStore } from '@/store/search-store';
import { EMPTY_SEARCH_FILTERS, SearchChips, type SearchFilters } from '../search/search-chips';
import { SaveSearchButton } from '../search/save-search-button';
import { SearchSnippet } from '../search/search-snippet';
import { Box, Compass, FileText } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BulkActionsBar } from './bulk-actions-bar';
import { IssueLine } from './issue-line';

/**
 * Busca dedicada — usa `GET /api/v1/search` (índice full-text), com resultados
 * AGRUPADOS por tipo, snippet destacado, chips rápidos (Type/Team/Status) e
 * "Save search".
 *
 * As issues continuam renderizando pelo `issues-store` (mesmo padrão do ⌘K): o
 * servidor devolve só os ids ranqueados e a linha vem do store, então a edição inline
 * (status, prioridade, assignee…) reflete e persiste como em qualquer lista. Resultado
 * que ainda não está no store entra por `applyRemote` (upsert), sem re-hidratar tudo.
 */

const GROUP_LABEL: Record<SearchEntityType, string> = {
   issue: 'Issues',
   project: 'Projects',
   initiative: 'Initiatives',
   document: 'Documents',
};

const GROUP_ICON: Record<Exclude<SearchEntityType, 'issue'>, typeof Box> = {
   project: Box,
   initiative: Compass,
   document: FileText,
};

function GroupShell({
   title,
   count,
   children,
}: React.PropsWithChildren<{ title: string; count: number }>) {
   return (
      <div className="mt-4 rounded-md border">
         <div className="border-b bg-muted/50 px-4 py-2">
            <h3 className="text-sm font-medium">
               {title} ({count})
            </h3>
         </div>
         <div className="divide-y">{children}</div>
      </div>
   );
}

/** Linha de projeto/initiative/document: ícone + título + snippet, navegável. */
function EntityLine({
   item,
   type,
   orgId,
}: {
   item: SearchItem;
   type: SearchEntityType;
   orgId: string;
}) {
   const Icon = GROUP_ICON[type as Exclude<SearchEntityType, 'issue'>] ?? Box;
   return (
      <Link
         href={`/${orgId}${item.url}`}
         className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
      >
         <Icon className="size-4 shrink-0 text-muted-foreground" />
         <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{item.title}</p>
            <SearchSnippet html={item.snippet} />
         </div>
      </Link>
   );
}

export function SearchIssues() {
   const [groups, setGroups] = useState<SearchGroup[]>([]);
   const [loading, setLoading] = useState(false);
   const [filters, setFilters] = useState<SearchFilters>(EMPTY_SEARCH_FILTERS);
   const { searchQuery, isSearchOpen } = useSearchStore();
   const issues = useIssuesStore((s) => s.issues);
   const applyRemote = useIssuesStore((s) => s.applyRemote);
   const params = useParams<{ orgId?: string }>();
   const orgId = params?.orgId ?? 'nimbloo';

   useEffect(() => {
      const q = searchQuery.trim();
      if (q === '') {
         setGroups([]);
         return;
      }
      let active = true;
      setLoading(true);
      // Debounce: evita uma request por tecla digitada.
      const t = setTimeout(() => {
         api.search
            .query({
               q,
               types: filters.types.length ? filters.types : undefined,
               teamId: filters.teamId,
               statusId: filters.statusId,
               limit: 30,
            })
            .then((res) => {
               if (!active) return;
               setGroups(res.groups);
               const found = res.groups.find((g) => g.type === 'issue')?.items ?? [];
               const known = new Set(useIssuesStore.getState().issues.map((i) => i.id));
               found.filter((i) => !known.has(i.id)).forEach((i) => void applyRemote(i.id));
            })
            .catch(() => {
               if (active) setGroups([]);
            })
            .finally(() => {
               if (active) setLoading(false);
            });
      }, 250);
      return () => {
         active = false;
         clearTimeout(t);
      };
   }, [searchQuery, filters, applyRemote]);

   const issueItems = useMemo(() => groups.find((g) => g.type === 'issue')?.items ?? [], [groups]);
   // Ordem do servidor (relevância), resolvida contra o store vivo.
   const issueResults = useMemo(() => {
      const byId = new Map(issues.map((issue) => [issue.id, issue]));
      return issueItems
         .map((item) => ({ item, issue: byId.get(item.id) }))
         .filter((r): r is { item: SearchItem; issue: NonNullable<typeof r.issue> } =>
            Boolean(r.issue)
         );
   }, [issueItems, issues]);

   const otherGroups = groups.filter((g) => g.type !== 'issue' && g.items.length > 0);
   const total = issueResults.length + otherGroups.reduce((n, g) => n + g.items.length, 0);

   if (!isSearchOpen) return null;

   return (
      <div className="w-full">
         <BulkActionsBar />
         <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <SearchChips value={filters} onChange={setFilters} />
            <SaveSearchButton query={searchQuery} filters={filters} />
         </div>
         {searchQuery.trim() !== '' && (
            <div>
               {total > 0 ? (
                  <>
                     {issueResults.length > 0 && (
                        <GroupShell title={GROUP_LABEL.issue} count={issueResults.length}>
                           {issueResults.map(({ item, issue }) => (
                              <div key={issue.id}>
                                 <IssueLine issue={issue} layoutId={false} />
                                 <SearchSnippet html={item.snippet} className="px-6 pb-2" />
                              </div>
                           ))}
                        </GroupShell>
                     )}
                     {otherGroups.map((g) => (
                        <GroupShell key={g.type} title={GROUP_LABEL[g.type]} count={g.items.length}>
                           {g.items.map((item) => (
                              <EntityLine key={item.id} item={item} type={g.type} orgId={orgId} />
                           ))}
                        </GroupShell>
                     ))}
                  </>
               ) : (
                  <div className="py-8 text-center text-muted-foreground">
                     {loading ? 'Searching…' : `No results found for "${searchQuery}"`}
                  </div>
               )}
            </div>
         )}
      </div>
   );
}
