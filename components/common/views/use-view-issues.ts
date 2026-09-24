'use client';

import { useMemo } from 'react';
import type { Issue } from '@/data/issues';
import { filterIssuesForView, type View } from '@/data/views';
import { useIssuesStore } from '@/store/issues-store';
import { useSavedSearchStore } from '@/store/saved-search-store';

/** Teto de resultados da busca (o mesmo `MAX_LIMIT` de `/api/v1/search`). */
export const SAVED_SEARCH_LIMIT = 100;

/** Chave do ranking de uma saved search: termo ou time novos não reaproveitam o antigo. */
export function savedSearchKey(view: View): string {
   return `${view.id}|${view.filter.q?.trim() ?? ''}|${view.teamId ?? ''}`;
}

export interface ViewIssues {
   /** Termo da saved search (vazio = view comum). */
   q: string;
   /** Issues da view: filtros e, com termo, a interseção com o ranking (na ordem dele). */
   issues: Issue[];
   /** Com termo, a 1ª busca ainda não voltou. */
   searching: boolean;
   searchError: boolean;
   /** A busca bateu no teto: pode haver mais resultados além dos mostrados. */
   truncated: boolean;
}

/** Issues de uma view de issues — o MESMO cálculo para o header (contador) e o corpo. */
export function useViewIssues(view: View): ViewIssues {
   const liveIssues = useIssuesStore((s) => s.issues);
   const q = view.filter.q?.trim() ?? '';
   const entry = useSavedSearchStore((s) => s.byKey[savedSearchKey(view)]);
   const rankedIds = entry?.rankedIds ?? null;
   const filtered = useMemo(() => filterIssuesForView(view, liveIssues), [view, liveIssues]);
   const issues = useMemo(() => {
      if (!q) return filtered;
      if (rankedIds === null) return [];
      const position = new Map(rankedIds.map((id, i) => [id, i]));
      return filtered
         .filter((i) => position.has(i.id))
         .sort((a, b) => position.get(a.id)! - position.get(b.id)!);
   }, [q, rankedIds, filtered]);
   const error = !!q && !!entry?.error;
   return {
      q,
      issues,
      searching: !!q && rankedIds === null && !error,
      searchError: error,
      truncated: !!q && (rankedIds?.length ?? 0) >= SAVED_SEARCH_LIMIT,
   };
}
