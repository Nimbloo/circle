'use client';

import { Issue } from '@/data/issues';
import { Status } from '@/data/status';
import { Priority } from '@/data/priorities';
import { Project } from '@/data/projects';
import { User } from '@/data/users';
import { useIssuesStore } from '@/store/issues-store';

/**
 * Descreve a dimensão de agrupamento de uma coluna do board. Antes o drag-and-drop
 * só sabia mudar STATUS (e no agrupamento por assignee/priority/project fazia a coisa
 * errada — mudava o status ao soltar num card de status diferente). Este descritor
 * carrega o valor do grupo pra o drop aplicar a dimensão correta.
 */
export type IssueGroupDrop =
   | { dimension: 'none' }
   | { dimension: 'status'; status: Status }
   | { dimension: 'assignee'; assignee: User | null }
   | { dimension: 'priority'; priority: Priority }
   | { dimension: 'project'; project: Project | undefined };

/** true se a issue já pertence ao grupo (drop no mesmo grupo → reordena, não muda campo). */
export function issueInGroup(issue: Issue, drop: IssueGroupDrop): boolean {
   switch (drop.dimension) {
      case 'none':
         return true;
      case 'status':
         return issue.status.id === drop.status.id;
      case 'assignee':
         return (issue.assignee?.id ?? null) === (drop.assignee?.id ?? null);
      case 'priority':
         return issue.priority.id === drop.priority.id;
      case 'project':
         return (issue.project?.id ?? null) === (drop.project?.id ?? null);
   }
}

/** Retorna uma fn que move a issue pro grupo aplicando a dimensão (otimista, via store). */
export function useApplyGroupDrop() {
   const updateIssueStatus = useIssuesStore((s) => s.updateIssueStatus);
   const updateIssuePriority = useIssuesStore((s) => s.updateIssuePriority);
   const updateIssueAssignee = useIssuesStore((s) => s.updateIssueAssignee);
   const updateIssueProject = useIssuesStore((s) => s.updateIssueProject);
   return (issue: Issue, drop: IssueGroupDrop) => {
      switch (drop.dimension) {
         case 'none':
            return;
         case 'status':
            updateIssueStatus(issue.id, drop.status);
            return;
         case 'assignee':
            updateIssueAssignee(issue.id, drop.assignee);
            return;
         case 'priority':
            updateIssuePriority(issue.id, drop.priority);
            return;
         case 'project':
            updateIssueProject(issue.id, drop.project);
            return;
      }
   };
}
