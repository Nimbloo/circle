import { groupIssuesByStatus, Issue, issues as mockIssues } from '@/mock-data/issues';
import { LabelInterface } from '@/mock-data/labels';
import { Priority } from '@/mock-data/priorities';
import { Project } from '@/mock-data/projects';
import { Status } from '@/mock-data/status';
import { User } from '@/mock-data/users';
import { create } from 'zustand';
import { api } from '@/lib/client';
import { adaptIssues } from '@/lib/adapters';
import type { CreateIssueInput, UpdateIssueInput, IssueListOptions } from '@/lib/api/issues';

interface FilterOptions {
   status?: string[];
   assignee?: string[];
   priority?: string[];
   labels?: string[];
   project?: string[];
   cycle?: string[];
   statusType?: string[];
}

interface IssuesState {
   issues: Issue[];
   issuesByStatus: Record<string, Issue[]>;
   loading: boolean;

   /** Carrega as issues da API (opcionalmente escopadas) e substitui o estado. */
   hydrate: (opts?: IssueListOptions) => Promise<void>;

   getAllIssues: () => Issue[];

   addIssue: (issue: Issue) => void;
   updateIssue: (id: string, updatedIssue: Partial<Issue>) => void;
   deleteIssue: (id: string) => void;

   filterByStatus: (statusId: string) => Issue[];
   filterByPriority: (priorityId: string) => Issue[];
   filterByAssignee: (userId: string | null) => Issue[];
   filterByLabel: (labelId: string) => Issue[];
   filterByProject: (projectId: string) => Issue[];
   filterByCycle: (cycleId: string) => Issue[];
   searchIssues: (query: string) => Issue[];
   filterIssues: (filters: FilterOptions) => Issue[];

   updateIssueStatus: (issueId: string, newStatus: Status) => void;
   updateIssuePriority: (issueId: string, newPriority: Priority) => void;
   updateIssueAssignee: (issueId: string, newAssignee: User | null) => void;
   addIssueLabel: (issueId: string, label: LabelInterface) => void;
   removeIssueLabel: (issueId: string, labelId: string) => void;
   updateIssueProject: (issueId: string, newProject: Project | undefined) => void;

   getIssueById: (id: string) => Issue | undefined;
}

const sortByRank = (issues: Issue[]) => [...issues].sort((a, b) => b.rank.localeCompare(a.rank));

/** Mapeia um Partial<Issue> (objetos ricos) para o patch da API (ids). */
function toUpdateInput(updated: Partial<Issue>): UpdateIssueInput {
   const patch: UpdateIssueInput = {};
   if ('title' in updated) patch.title = updated.title;
   if ('status' in updated) patch.statusId = updated.status?.id;
   if ('priority' in updated) patch.priorityId = updated.priority?.id;
   if ('assignee' in updated) patch.assigneeId = updated.assignee ? updated.assignee.id : null;
   if ('project' in updated) patch.projectId = updated.project ? updated.project.id : null;
   if ('cycleId' in updated) patch.cycleId = updated.cycleId;
   if ('dueDate' in updated) patch.dueDate = updated.dueDate ?? null;
   return patch;
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
   // Estado inicial = mock (render instantâneo / fallback); hydrate() troca pela API.
   issues: sortByRank(mockIssues),
   issuesByStatus: groupIssuesByStatus(mockIssues),
   loading: false,

   hydrate: async (opts?: IssueListOptions) => {
      set({ loading: true });
      try {
         const dtos = await api.issues.list(opts);
         const issues = sortByRank(adaptIssues(dtos));
         set({ issues, issuesByStatus: groupIssuesByStatus(issues), loading: false });
      } catch {
         // mantém o estado atual (mock ou anterior) se a API falhar
         set({ loading: false });
      }
   },

   getAllIssues: () => get().issues,

   addIssue: (issue: Issue) => {
      // otimista
      set((state) => {
         const newIssues = [...state.issues, issue];
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      const input: CreateIssueInput = {
         teamId: (issue.project as { teamId?: string } | undefined)?.teamId ?? 'CORE',
         title: issue.title,
         statusId: issue.status.id,
         priorityId: issue.priority.id,
         assigneeId: issue.assignee?.id ?? null,
         projectId: issue.project?.id ?? null,
         cycleId: issue.cycleId || null,
         labelIds: issue.labels.map((l) => l.id),
         dueDate: issue.dueDate ?? null,
      };
      // após criar, re-hidrata p/ obter identifier/rank gerados no servidor
      api.issues
         .create(input)
         .then(() => get().hydrate())
         .catch(() => undefined);
   },

   updateIssue: (id: string, updatedIssue: Partial<Issue>) => {
      set((state) => {
         const newIssues = state.issues.map((issue) =>
            issue.id === id ? { ...issue, ...updatedIssue } : issue
         );
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      api.issues.update(id, toUpdateInput(updatedIssue)).catch(() => undefined);
   },

   deleteIssue: (id: string) => {
      set((state) => {
         const newIssues = state.issues.filter((issue) => issue.id !== id);
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      api.issues.remove(id).catch(() => undefined);
   },

   filterByStatus: (statusId) => get().issues.filter((i) => i.status.id === statusId),
   filterByPriority: (priorityId) => get().issues.filter((i) => i.priority.id === priorityId),
   filterByAssignee: (userId) =>
      userId === null
         ? get().issues.filter((i) => i.assignee === null)
         : get().issues.filter((i) => i.assignee?.id === userId),
   filterByLabel: (labelId) => get().issues.filter((i) => i.labels.some((l) => l.id === labelId)),
   filterByProject: (projectId) => get().issues.filter((i) => i.project?.id === projectId),
   filterByCycle: (cycleId) => get().issues.filter((i) => i.cycleId === cycleId),

   searchIssues: (query) => {
      const q = query.toLowerCase();
      return get().issues.filter(
         (i) => i.title.toLowerCase().includes(q) || i.identifier.toLowerCase().includes(q)
      );
   },

   filterIssues: (filters: FilterOptions) => {
      let out = get().issues;
      if (filters.status?.length) out = out.filter((i) => filters.status!.includes(i.status.id));
      if (filters.assignee?.length) {
         out = out.filter((i) => {
            if (filters.assignee!.includes('unassigned') && i.assignee === null) return true;
            return i.assignee && filters.assignee!.includes(i.assignee.id);
         });
      }
      if (filters.priority?.length)
         out = out.filter((i) => filters.priority!.includes(i.priority.id));
      if (filters.labels?.length)
         out = out.filter((i) => i.labels.some((l) => filters.labels!.includes(l.id)));
      if (filters.project?.length)
         out = out.filter((i) => i.project && filters.project!.includes(i.project.id));
      if (filters.cycle?.length) {
         out = out.filter((i) => {
            if (filters.cycle!.includes('no-cycle') && i.cycleId === '') return true;
            return filters.cycle!.includes(i.cycleId);
         });
      }
      if (filters.statusType?.length)
         out = out.filter((i) => filters.statusType!.includes(i.status.category));
      return out;
   },

   updateIssueStatus: (issueId, newStatus) => get().updateIssue(issueId, { status: newStatus }),
   updateIssuePriority: (issueId, newPriority) =>
      get().updateIssue(issueId, { priority: newPriority }),
   updateIssueAssignee: (issueId, newAssignee) =>
      get().updateIssue(issueId, { assignee: newAssignee }),

   addIssueLabel: (issueId, label) => {
      const issue = get().getIssueById(issueId);
      if (!issue) return;
      set((state) => {
         const newIssues = state.issues.map((i) =>
            i.id === issueId ? { ...i, labels: [...i.labels, label] } : i
         );
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      api.issues.addLabel(issueId, label.id).catch(() => undefined);
   },

   removeIssueLabel: (issueId, labelId) => {
      set((state) => {
         const newIssues = state.issues.map((i) =>
            i.id === issueId ? { ...i, labels: i.labels.filter((l) => l.id !== labelId) } : i
         );
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      api.issues.removeLabel(issueId, labelId).catch(() => undefined);
   },

   updateIssueProject: (issueId, newProject) => get().updateIssue(issueId, { project: newProject }),

   getIssueById: (id) => get().issues.find((i) => i.id === id),
}));
