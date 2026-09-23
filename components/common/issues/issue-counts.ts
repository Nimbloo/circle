'use client';

import { useMemo, type ReactNode } from 'react';
import type { Issue } from '@/data/issues';
import { useIssuesStore } from '@/store/issues-store';

/** Chave(s) de agrupamento de uma issue; `null`/`undefined` não conta. */
export type IssueCountKey = (issue: Issue) => string | null | undefined | readonly string[];

/** Contagem por chave numa passada só (O(n)), em vez de um `filter` por opção (O(n·k)). */
export function countIssuesBy(issues: Issue[], keyOf: IssueCountKey): Map<string, number> {
   const counts = new Map<string, number>();
   const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
   for (const issue of issues) {
      const key = keyOf(issue);
      if (typeof key === 'string') bump(key);
      else if (key) key.forEach(bump);
   }
   return counts;
}

/**
 * Contagens dos dropdowns de propriedade (status/prioridade/label/projeto/assignee).
 * Chamar SÓ dentro do conteúdo do popover (montado quando aberto): assinar `s.issues`
 * no trigger acordava toda linha da lista a cada evento SSE. `keyOf` deve ser estável
 * (constante de módulo).
 */
export function useIssueCounts(keyOf: IssueCountKey, teamId?: string): Map<string, number> {
   const issues = useIssuesStore((s) => s.issues);
   return useMemo(() => {
      const scoped = teamId ? issues.filter((i) => i.teamId === teamId) : issues;
      return countIssuesBy(scoped, keyOf);
   }, [issues, keyOf, teamId]);
}

/** Render-prop de `useIssueCounts` para envolver o conteúdo de um popover. */
export function IssueCounts({
   by,
   children,
}: {
   by: IssueCountKey;
   children: (counts: Map<string, number>) => ReactNode;
}) {
   const counts = useIssueCounts(by);
   return children(counts);
}
