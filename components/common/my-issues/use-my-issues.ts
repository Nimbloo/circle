'use client';

import { Issue } from '@/data/issues';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

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

const isCreatedByMe = (issue: Issue, meId: string): boolean => issue.createdById === meId;

/**
 * Issues shown by each My issues tab. `meId` = usuário corrente (SSO);
 * `subscribedIds` = assinaturas REAIS (issue_subscription), não mais uma heurística.
 * A aba "Activity" tem feed próprio (activity-feed), não passa por aqui.
 */
export function scopeMyIssues(
   issues: Issue[],
   tab: MyIssuesTab,
   meId: string | undefined,
   subscribedIds: ReadonlySet<string>
): Issue[] {
   if (!meId) return [];
   switch (tab) {
      case 'assigned':
         return issues.filter((issue) => issue.assignee?.id === meId);
      case 'created':
         return issues.filter((issue) => isCreatedByMe(issue, meId));
      case 'subscribed':
      case 'activity':
      default:
         return issues.filter((issue) => subscribedIds.has(issue.id));
   }
}
