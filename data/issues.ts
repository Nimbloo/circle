import type { LabelInterface } from './labels';
import type { Priority } from './priorities';
import type { Project } from './projects';
import type { Status, StatusCategory } from './status';
import type { User } from './users';
import type { EditorDoc } from '@/lib/editor-doc';

export interface Issue {
   id: string;
   identifier: string;
   teamId?: string; // key do time dono (CORE, DESIGN) — usado p/ escopar as views por time
   title: string;
   description: string;
   /** Doc do editor de blocos na criação (o servidor deriva `description`). */
   descriptionDoc?: EditorDoc | null;
   status: Status;
   /** Responsável PRINCIPAL (= `assignees[0]`); mantido para tudo que é single-assignee. */
   assignee: User | null;
   /** Todos os responsáveis (#96): principal primeiro, depois colaboradores. */
   assignees: User[];
   priority: Priority;
   labels: LabelInterface[];
   createdAt: string;
   /** Cycle the issue belongs to. Empty string = no cycle (backlog stock). */
   cycleId: string;
   project?: Project;
   subissues?: string[];
   /** Rollup de sub-issues (paridade Linear): total e concluídas. 0/0 = sem filhas. */
   subIssueCount?: number;
   subIssueDoneCount?: number;
   /** Pai canônico (#95): id e identifier (chip na linha). null/undefined = issue de topo. */
   parentId?: string | null;
   parentIdentifier?: string | null;
   /** Snooze de triage (ISO) — enquanto futuro, some da fila de triage. */
   snoozedUntil?: string | null;
   /** SLA do time (#97): quando o `dueDate` foi calculado pelo SLA. null = data manual. */
   slaAppliedAt?: string | null;
   rank: string;
   dueDate?: string;
   /** Pontos de estimativa (undefined = sem estimativa). */
   estimate?: number;
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
