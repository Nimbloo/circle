import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { labelColor } from '@/components/common/palette';
import type { Issue } from '@/data/issues';
import type { LabelInterface } from '@/data/labels';
import type { Priority } from '@/data/priorities';
import type { Status } from '@/data/status';
import type { GroupingKey } from '@/store/display-settings-store';
import { Box, Tag, User } from 'lucide-react';
import type { IssueGroupDescriptor } from './group-issues';

export interface GroupEntry {
   group: IssueGroupDescriptor;
   issues: Issue[];
   /** Count of issues in this group before the filter bar. */
   total: number;
   /** Issues do grupo antes da barra de filtros (base do sub-agrupamento). */
   scope: Issue[];
}

export const groupByKey = (
   issues: Issue[],
   keyOf: (issue: Issue) => string
): Map<string, Issue[]> => {
   const map = new Map<string, Issue[]>();
   // Push no array do grupo (O(n)); o spread por issue era O(n²) em listas grandes.
   for (const issue of issues) {
      const key = keyOf(issue);
      const bucket = map.get(key);
      if (bucket) bucket.push(issue);
      else map.set(key, [issue]);
   }
   return map;
};

interface BuildIssueGroupsInput {
   grouping: GroupingKey;
   /** Issues exibidas (após a barra de filtros), na ordem desejada — a ordem é preservada. */
   visibleIssues: Issue[];
   /** Mesmo escopo antes da barra de filtros (contagens "0 / n"). */
   scopeIssues: Issue[];
   statuses: Status[];
   priorities: Priority[];
   labels: LabelInterface[];
}

/**
 * Agrupa issues por uma dimensão do Display (status, assignee, priority, project, label,
 * none). Usada pelo grupo principal e, de novo, pelo sub-grupo (lista) / swimlane (board).
 */
export function buildIssueGroups({
   grouping,
   visibleIssues,
   scopeIssues,
   statuses,
   priorities,
   labels,
}: BuildIssueGroupsInput): GroupEntry[] {
   const entry = (group: IssueGroupDescriptor, issues: Issue[], scope: Issue[]): GroupEntry => ({
      group,
      issues,
      total: scope.length,
      scope,
   });

   switch (grouping) {
      case 'assignee': {
         const keyOf = (issue: Issue) => issue.assignee?.id ?? 'no-assignee';
         const totals = groupByKey(scopeIssues, keyOf);
         const visible = groupByKey(visibleIssues, keyOf);
         return [...totals.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([key, totalGroup]) => {
               const assignee = totalGroup[0].assignee;
               return entry(
                  {
                     id: key,
                     name: assignee?.name ?? 'No assignee',
                     icon: assignee ? (
                        <Avatar className="size-4">
                           <AvatarImage src={assignee.avatarUrl || undefined} alt={assignee.name} />
                           <AvatarFallback>{assignee.name[0]}</AvatarFallback>
                        </Avatar>
                     ) : (
                        <User className="size-4 text-muted-foreground" />
                     ),
                     drop: { field: 'assignee', assignee: assignee ?? null },
                  },
                  visible.get(key) ?? [],
                  totalGroup
               );
            });
      }
      case 'priority': {
         return priorities.map((priority) =>
            entry(
               {
                  id: priority.id,
                  name: priority.name,
                  icon: <priority.icon className="size-4 text-muted-foreground" />,
                  drop: { field: 'priority', priority },
               },
               visibleIssues.filter((issue) => issue.priority.id === priority.id),
               scopeIssues.filter((issue) => issue.priority.id === priority.id)
            )
         );
      }
      case 'project': {
         const keyOf = (issue: Issue) => issue.project?.id ?? 'no-project';
         const totals = groupByKey(scopeIssues, keyOf);
         const visible = groupByKey(visibleIssues, keyOf);
         return [...totals.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([key, totalGroup]) => {
               const project = totalGroup[0].project;
               const Icon = project?.icon ?? Box;
               return entry(
                  {
                     id: key,
                     name: project?.name ?? 'No project',
                     icon: <Icon className="size-4 text-muted-foreground" />,
                     drop: { field: 'project', project },
                  },
                  visible.get(key) ?? [],
                  totalGroup
               );
            });
      }
      case 'label': {
         // Multi-valorado (padrão Linear): uma issue aparece em cada label que tem.
         const labelGroups = labels.map((label) =>
            entry(
               {
                  id: label.id,
                  name: label.name,
                  icon: (
                     <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: labelColor(label.color) }}
                     />
                  ),
               },
               visibleIssues.filter((issue) => issue.labels.some((l) => l.id === label.id)),
               scopeIssues.filter((issue) => issue.labels.some((l) => l.id === label.id))
            )
         );
         const noLabel = entry(
            {
               id: 'no-label',
               name: 'No label',
               icon: <Tag className="size-4 text-muted-foreground" />,
            },
            visibleIssues.filter((issue) => issue.labels.length === 0),
            scopeIssues.filter((issue) => issue.labels.length === 0)
         );
         return [...labelGroups, noLabel];
      }
      case 'none': {
         return [
            entry(
               {
                  id: 'all',
                  name: 'All issues',
                  icon: <Box className="size-4 text-muted-foreground" />,
               },
               visibleIssues,
               scopeIssues
            ),
         ];
      }
      case 'status':
      default: {
         return statuses.map((statusItem) =>
            entry(
               {
                  id: statusItem.id,
                  name: statusItem.name,
                  icon: <statusItem.icon />,
                  status: statusItem,
                  drop: { field: 'status', status: statusItem },
               },
               visibleIssues.filter((issue) => issue.status.id === statusItem.id),
               scopeIssues.filter((issue) => issue.status.id === statusItem.id)
            )
         );
      }
   }
}

/**
 * Descritor de um sub-grupo (lista) ou célula de swimlane (board) dentro de um grupo:
 * herda o `drop` do grupo principal e leva o do sub-grupo em `subDrop`.
 */
export function subGroupDescriptor(
   parent: IssueGroupDescriptor,
   sub: IssueGroupDescriptor
): IssueGroupDescriptor {
   return {
      id: `${parent.id}::${sub.id}`,
      name: sub.name,
      icon: sub.icon,
      status: parent.status ?? sub.status,
      drop: parent.drop,
      subDrop: sub.drop,
   };
}
