'use client';

import { Issue } from '@/mock-data/issues';
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
const isSubscribed = (issue: Issue, meId: string): boolean =>
   issue.assignee?.id === meId || isCreatedByMe(issue, meId);

/** Issues shown by each My issues tab. `meId` = usuário corrente (SSO). */
export function scopeMyIssues(
   issues: Issue[],
   tab: MyIssuesTab,
   meId: string | undefined
): Issue[] {
   if (!meId) return [];
   switch (tab) {
      case 'assigned':
         return issues.filter((issue) => issue.assignee?.id === meId);
      case 'created':
         return issues.filter((issue) => isCreatedByMe(issue, meId));
      case 'subscribed':
         return issues.filter((issue) => isSubscribed(issue, meId));
      case 'activity':
      default:
         // "Activity" = everything I touch, most recent first.
         return issues
            .filter((issue) => isSubscribed(issue, meId))
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
   }
}
