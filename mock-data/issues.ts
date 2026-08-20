import type { LabelInterface } from './labels';
import type { Priority } from './priorities';
import type { Project } from './projects';
import type { Status, StatusCategory } from './status';
import type { User } from './users';

export interface Issue {
   id: string;
   identifier: string;
   title: string;
   description: string;
   status: Status;
   assignee: User | null;
   priority: Priority;
   labels: LabelInterface[];
   createdAt: string;
   /** Cycle the issue belongs to. Empty string = no cycle (backlog stock). */
   cycleId: string;
   project?: Project;
   subissues?: string[];
   rank: string;
   dueDate?: string;
   /** Id do criador (vem do backend; usado em "My issues" > Created). */
   createdById?: string;
}

/**
 * Issues são carregadas da API em runtime (issues-store.hydrate()). Este array
 * fica vazio de propósito — o app é 100% API-driven, sem dados mock.
 */
export const issues: Issue[] = [];

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

export function groupIssuesByStatus(issues: Issue[]): Record<string, Issue[]> {
   return issues.reduce<Record<string, Issue[]>>((acc, issue) => {
      const statusId = issue.status.id;
      if (!acc[statusId]) acc[statusId] = [];
      acc[statusId].push(issue);
      return acc;
   }, {});
}

export function sortIssuesByPriority(issues: Issue[]): Issue[] {
   const priorityOrder: Record<string, number> = {
      'urgent': 0,
      'high': 1,
      'medium': 2,
      'low': 3,
      'no-priority': 4,
   };
   return issues
      .slice()
      .sort(
         (a, b) =>
            priorityOrder[a.priority.id as keyof typeof priorityOrder] -
            priorityOrder[b.priority.id as keyof typeof priorityOrder]
      );
}

export function filterIssuesByCycle(allIssues: Issue[], cycleId: string): Issue[] {
   return allIssues.filter((issue) => issue.cycleId === cycleId);
}

export function filterIssuesByCategories(
   allIssues: Issue[],
   categories: StatusCategory[]
): Issue[] {
   return allIssues.filter((issue) => categories.includes(issue.status.category));
}
