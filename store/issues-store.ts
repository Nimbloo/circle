import { groupIssuesByStatus, Issue } from '@/data/issues';
import { LabelInterface } from '@/data/labels';
import { Priority } from '@/data/priorities';
import { Project } from '@/data/projects';
import { Status } from '@/data/status';
import { User } from '@/data/users';
import { create } from 'zustand';
import { toast } from 'sonner';
import { api } from '@/lib/client';
import { adaptIssues } from '@/lib/adapters';
import { rankBetween } from '@/lib/api/rank';
import { useWorkspaceStore } from '@/store/workspace-store';
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
   /** true quando o último hydrate() falhou — o board mostra o estado de falha. */
   error: boolean;

   /** Carrega as issues da API (opcionalmente escopadas) e substitui o estado. */
   hydrate: (opts?: IssueListOptions) => Promise<void>;

   getAllIssues: () => Issue[];

   addIssue: (issue: Issue) => Promise<void>;
   updateIssue: (id: string, updatedIssue: Partial<Issue>) => void;
   deleteIssue: (id: string) => void;

   /** Sync em tempo real TARGETED: re-busca UMA issue e faz splice no store (sem
    *  re-hidratar as ~500). Fallback pra hydrate() só se o GET falhar (ex.: deletada). */
   applyRemote: (id: string) => Promise<void>;
   /** Remove UMA issue do store (evento remoto de delete) — sem refetch. */
   removeRemote: (id: string) => void;

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
   /** Reordena a issue por rank (drag-and-drop) entre dois vizinhos. Otimista + rollback. */
   reorderIssue: (id: string, beforeId: string | null, afterId: string | null) => void;

   getIssueById: (id: string) => Issue | undefined;
}

// asc(rank) — mesmo critério do servidor (listIssues faz orderBy asc(rank)); mantém
// a exibição alinhada com o drag-to-reorder (que grava um rank ENTRE dois vizinhos).
const sortByRank = (issues: Issue[]) => [...issues].sort((a, b) => a.rank.localeCompare(b.rank));

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
   if ('estimate' in updated) patch.estimate = updated.estimate ?? null;
   return patch;
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
   // Estado inicial vazio; hydrate() carrega da API (o board mostra "Carregando…"
   // enquanto isso, e o estado de erro/retry cobre a falha).
   issues: [],
   issuesByStatus: {},
   loading: false,
   error: false,

   hydrate: async (opts?: IssueListOptions) => {
      set({ loading: true, error: false });
      try {
         // Paginação KEYSET por rank (cursor = último rank): carrega TODAS as issues em
         // páginas (fim do truncamento silencioso do cap de 500) e preenche o board
         // PROGRESSIVAMENTE (a 1ª página aparece rápido; as demais chegam em background).
         // Só pagina na ordem default (rank); em outras ordens, uma página (cap do server).
         const PAGE = 200;
         const canPaginate = !opts?.orderBy || opts.orderBy === 'rank';
         const acc: Awaited<ReturnType<typeof api.issues.list>> = [];
         let cursor: string | undefined;
         for (let guard = 0; guard < 200; guard++) {
            const page = await api.issues.list({ ...opts, limit: PAGE, cursor });
            acc.push(...page);
            const issues = sortByRank(adaptIssues(acc));
            const done = !canPaginate || page.length < PAGE;
            set({
               issues,
               issuesByStatus: groupIssuesByStatus(issues),
               loading: !done,
               error: false,
            });
            if (done) break;
            cursor = page[page.length - 1].rank; // keyset: próximo `rank > cursor`
         }
      } catch {
         // mantém o estado atual (mock ou anterior) e sinaliza a falha p/ o board.
         set({ loading: false, error: true });
      }
   },

   getAllIssues: () => get().issues,

   addIssue: (issue: Issue) => {
      set((state) => {
         const newIssues = [...state.issues, issue];
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      const input: CreateIssueInput = {
         // Time: o do próprio issue (rota) → o do projeto → 1º time do workspace.
         // (Antes hardcodava 'CORE' — quebrava FK em workspace sem o time CORE.)
         teamId:
            issue.teamId ??
            (issue.project as { teamId?: string } | undefined)?.teamId ??
            useWorkspaceStore.getState().teams[0]?.id ??
            '',
         title: issue.title,
         description: issue.description || null, // era descartado → issue nascia sem descrição
         statusId: issue.status.id,
         priorityId: issue.priority.id,
         assigneeId: issue.assignee?.id ?? null,
         projectId: issue.project?.id ?? null,
         cycleId: issue.cycleId || null,
         labelIds: issue.labels.map((l) => l.id),
         dueDate: issue.dueDate ?? null,
         estimate: issue.estimate ?? null,
      };
      // Reconcilia com o DTO real do servidor (identifier/rank gerados): SPLICE de 1 item
      // — troca a issue otimista pela real, sem re-baixar todo o board (fim do "reload").
      // Em falha, restaura o snapshot e propaga o erro p/ o chamador dar o toast.
      return api.issues
         .create(input)
         .then((dto) => {
            const fresh = adaptIssues([dto])[0];
            set((state) => {
               const next = sortByRank([...state.issues.filter((i) => i.id !== issue.id), fresh]);
               return { issues: next, issuesByStatus: groupIssuesByStatus(next) };
            });
         })
         .catch((err) => {
            // Rollback DIRECIONADO: remove só a issue otimista (não clobra criações concorrentes).
            set((state) => {
               const next = state.issues.filter((i) => i.id !== issue.id);
               return { issues: next, issuesByStatus: groupIssuesByStatus(next) };
            });
            throw err;
         });
   },

   applyRemote: async (id: string) => {
      try {
         const dto = await api.issues.get(id);
         const fresh = adaptIssues([dto])[0];
         set((state) => {
            const exists = state.issues.some((i) => i.id === id);
            const next = exists
               ? state.issues.map((i) => (i.id === id ? fresh : i))
               : [...state.issues, fresh];
            const sorted = sortByRank(next);
            return { issues: sorted, issuesByStatus: groupIssuesByStatus(sorted) };
         });
      } catch {
         // GET falhou (issue deletada / erro) → reconcilia com um hydrate completo (raro).
         void get().hydrate();
      }
   },

   removeRemote: (id: string) => {
      set((state) => {
         if (!state.issues.some((i) => i.id === id)) return {};
         const next = state.issues.filter((i) => i.id !== id);
         return { issues: next, issuesByStatus: groupIssuesByStatus(next) };
      });
   },

   updateIssue: (id: string, updatedIssue: Partial<Issue>) => {
      const snapshot = { issues: get().issues, issuesByStatus: get().issuesByStatus };
      set((state) => {
         const newIssues = state.issues.map((issue) =>
            issue.id === id ? { ...issue, ...updatedIssue } : issue
         );
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      api.issues.update(id, toUpdateInput(updatedIssue)).catch(() => {
         set(snapshot);
         toast.error('Falha ao atualizar a issue');
      });
   },

   deleteIssue: (id: string) => {
      const snapshot = { issues: get().issues, issuesByStatus: get().issuesByStatus };
      set((state) => {
         const newIssues = state.issues.filter((issue) => issue.id !== id);
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      api.issues.remove(id).catch(() => {
         set(snapshot);
         toast.error('Falha ao excluir a issue');
      });
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
      const snapshot = { issues: get().issues, issuesByStatus: get().issuesByStatus };
      set((state) => {
         const newIssues = state.issues.map((i) =>
            i.id === issueId ? { ...i, labels: [...i.labels, label] } : i
         );
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      api.issues.addLabel(issueId, label.id).catch(() => {
         set(snapshot);
         toast.error('Falha ao adicionar a label');
      });
   },

   removeIssueLabel: (issueId, labelId) => {
      const snapshot = { issues: get().issues, issuesByStatus: get().issuesByStatus };
      set((state) => {
         const newIssues = state.issues.map((i) =>
            i.id === issueId ? { ...i, labels: i.labels.filter((l) => l.id !== labelId) } : i
         );
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      api.issues.removeLabel(issueId, labelId).catch(() => {
         set(snapshot);
         toast.error('Falha ao remover a label');
      });
   },

   updateIssueProject: (issueId, newProject) => get().updateIssue(issueId, { project: newProject }),

   reorderIssue: (id, beforeId, afterId) => {
      const current = get().issues;
      const moved = current.find((i) => i.id === id);
      if (!moved) return;
      const prevRank = moved.rank; // p/ rollback direcionado (só esta issue)

      // Rank otimista LOCAL entre os vizinhos (o servidor recalcula o real). A ordem é
      // derivada do RANK, não da posição do array — assim um reconcile concorrente que
      // re-sorta por rank (SSE/outro reorder) não desfaz este move, e o rollback fica
      // direcionado à issue movida (não clobra reorders concorrentes que já sucederam).
      const rankOf = (nid: string | null) =>
         nid ? (current.find((i) => i.id === nid)?.rank ?? null) : null;
      const optimisticRank = rankBetween(rankOf(beforeId), rankOf(afterId));

      const applyRank = (rank: string) => (state: IssuesState) => {
         const next = sortByRank(state.issues.map((i) => (i.id === id ? { ...i, rank } : i)));
         return { issues: next, issuesByStatus: groupIssuesByStatus(next) };
      };
      set(applyRank(optimisticRank));

      api.issues
         .reorder(id, beforeId, afterId)
         .then((dto) => {
            // Reconcilia com o rank REAL do servidor (splice de 1 item).
            const fresh = adaptIssues([dto])[0];
            set((state) => {
               const next = sortByRank(state.issues.map((i) => (i.id === id ? fresh : i)));
               return { issues: next, issuesByStatus: groupIssuesByStatus(next) };
            });
         })
         .catch(() => {
            set(applyRank(prevRank)); // rollback só desta issue
            toast.error('Falha ao reordenar a issue');
         });
   },

   getIssueById: (id) => get().issues.find((i) => i.id === id),
}));
