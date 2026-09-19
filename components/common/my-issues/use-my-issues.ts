'use client';

import { Issue } from '@/data/issues';
import { api } from '@/lib/client';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useState } from 'react';

export const MY_ISSUES_TABS = ['assigned', 'created', 'subscribed', 'activity'] as const;
export type MyIssuesTab = (typeof MY_ISSUES_TABS)[number];

export const MY_ISSUES_TAB_ITEMS: { label: string; value: MyIssuesTab }[] = [
   { label: 'Assigned', value: 'assigned' },
   { label: 'Created', value: 'created' },
   { label: 'Subscribed', value: 'subscribed' },
   { label: 'Activity', value: 'activity' },
];

/** Shared tab state (URL-backed) between the header and the page body. */
export function useMyIssuesTab() {
   return useQueryState('tab', parseAsStringLiteral(MY_ISSUES_TABS).withDefault('assigned'));
}

/**
 * Ids das issues com atividade minha (aba "Activity"). Busca sob demanda quando a
 * aba está ativa; usado tanto pelo header (contador) quanto pelo corpo (board) para
 * não divergir (is#17: o contador mostrava o total de "Subscribed" na aba Activity
 * por não ter esses ids).
 */
export function useMyIssuesActiveIds(tab: MyIssuesTab): ReadonlySet<string> {
   const [activeIds, setActiveIds] = useState<ReadonlySet<string>>(new Set());
   useEffect(() => {
      if (tab !== 'activity') return;
      let alive = true;
      api.me
         .activity()
         .then((items) => alive && setActiveIds(new Set(items.map((i) => i.issueId))))
         .catch(() => {});
      return () => {
         alive = false;
      };
   }, [tab]);
   return activeIds;
}

const isCreatedByMe = (issue: Issue, meId: string): boolean => issue.createdById === meId;

/** Sou responsável (principal OU colaborador, #96). */
const isAssignedToMe = (issue: Issue, meId: string): boolean =>
   (issue.assignees ?? []).some((a) => a.id === meId) || issue.assignee?.id === meId;

/**
 * Issues shown by each My issues tab. `meId` = usuário corrente (SSO);
 * `subscribedIds` = assinaturas REAIS (issue_subscription), não mais uma heurística.
 * A aba "Activity" tem feed próprio (activity-feed), não passa por aqui.
 * "Assigned" sai dos responsáveis das issues do store (principal e colaboradores).
 */
export function scopeMyIssues(
   issues: Issue[],
   tab: MyIssuesTab,
   meId: string | undefined,
   subscribedIds: ReadonlySet<string>,
   activeIds?: ReadonlySet<string>
): Issue[] {
   if (!meId) return [];
   switch (tab) {
      case 'assigned':
         return issues.filter((issue) => isAssignedToMe(issue, meId));
      case 'created':
         return issues.filter((issue) => isCreatedByMe(issue, meId));
      case 'activity':
         // "Activity" = issues em que EU estive ativo (padrão Linear, board de issues).
         // `activeIds` vem do /me/activity; sem ele (ex.: contador do header), aproxima
         // pelas assinadas.
         return issues.filter((issue) => (activeIds ?? subscribedIds).has(issue.id));
      case 'subscribed':
      default:
         return issues.filter((issue) => subscribedIds.has(issue.id));
   }
}
