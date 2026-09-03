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

   addIssue: (issue: Issue) => Promise<void>;
   updateIssue: (id: string, updatedIssue: Partial<Issue>) => Promise<void>;
   deleteIssue: (id: string) => Promise<void>;

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

   updateIssueStatus: (issueId: string, newStatus: Status) => Promise<void>;
   updateIssuePriority: (issueId: string, newPriority: Priority) => Promise<void>;
   /** Troca só o PRINCIPAL (mantém colaboradores) — caminho single-assignee legado. */
   updateIssueAssignee: (issueId: string, newAssignee: User | null) => Promise<void>;
   /** Substitui o CONJUNTO de responsáveis; o 1º vira o principal. `[]` limpa todos. */
   updateIssueAssignees: (issueId: string, assignees: User[]) => Promise<void>;
   addIssueLabel: (issueId: string, label: LabelInterface) => Promise<void>;
   removeIssueLabel: (issueId: string, labelId: string) => Promise<void>;
   updateIssueProject: (issueId: string, newProject: Project | undefined) => Promise<void>;
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
   // Conjunto completo tem precedência (substitui todos); `assignee` sozinho troca só o
   // principal no servidor e mantém os colaboradores.
   if ('assignees' in updated) patch.assigneeIds = (updated.assignees ?? []).map((a) => a.id);
   else if ('assignee' in updated) patch.assigneeId = updated.assignee ? updated.assignee.id : null;
   if ('project' in updated) patch.projectId = updated.project ? updated.project.id : null;
   if ('cycleId' in updated) patch.cycleId = updated.cycleId;
   if ('dueDate' in updated) patch.dueDate = updated.dueDate ?? null;
   if ('estimate' in updated) patch.estimate = updated.estimate ?? null;
   if ('snoozedUntil' in updated) patch.snoozedUntil = updated.snoozedUntil ?? null;
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
      // Preenchimento PROGRESSIVO só na primeira carga (store vazio): a 1ª página
      // aparece rápido e as demais chegam em background. Num RE-hydrate (SSE de
      // label, fallback do applyRemote) o store já tem dados — substituir página a
      // página faria o board ENCOLHER pra 200 linhas e re-crescer (mini-refresh);
      // nesse caso acumula tudo em silêncio e faz um set único no final.
      const progressive = get().issues.length === 0;
      set(progressive ? { loading: true, error: false } : { error: false });
      try {
         // Paginação KEYSET por rank (cursor = último rank): carrega TODAS as issues em
         // páginas (fim do truncamento silencioso do cap de 500).
         // Só pagina na ordem default (rank); em outras ordens, uma página (cap do server).
         const PAGE = 200;
         const canPaginate = !opts?.orderBy || opts.orderBy === 'rank';
         const acc: Awaited<ReturnType<typeof api.issues.list>> = [];
         let cursor: string | undefined;
         for (let guard = 0; guard < 200; guard++) {
            const page = await api.issues.list({ ...opts, limit: PAGE, cursor });
            acc.push(...page);
            const done = !canPaginate || page.length < PAGE;
            if (progressive || done) {
               const issues = sortByRank(adaptIssues(acc));
               set({
                  issues,
                  issuesByStatus: groupIssuesByStatus(issues),
                  loading: !done && progressive,
                  error: false,
               });
            }
            if (done) break;
            cursor = page[page.length - 1].rank; // keyset: próximo `rank > cursor`
         }
      } catch {
         // mantém o estado atual (mock ou anterior) e sinaliza a falha p/ o board.
         set({ loading: false, error: true });
      }
   },

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
         ...(issue.descriptionDoc ? { descriptionDoc: issue.descriptionDoc } : {}),
         statusId: issue.status.id,
         priorityId: issue.priority.id,
         assigneeId: issue.assignee?.id ?? null,
         assigneeIds: (issue.assignees?.length
            ? issue.assignees
            : issue.assignee
              ? [issue.assignee]
              : []
         ).map((a) => a.id),
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

   // Retorna a promise e RE-LANÇA no erro (após rollback + toast.error): assim os
   // chamadores (⌘K, bulk) podem toastar sucesso SÓ quando a API confirma, sem o
   // duplo-toast contraditório. O toast de erro segue fonte única aqui.
   updateIssue: (id: string, updatedIssue: Partial<Issue>) => {
      const snapshot = { issues: get().issues, issuesByStatus: get().issuesByStatus };
      set((state) => {
         const newIssues = state.issues.map((issue) =>
            issue.id === id ? { ...issue, ...updatedIssue } : issue
         );
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      return api.issues
         .update(id, toUpdateInput(updatedIssue))
         .catch((e) => {
            set(snapshot);
            toast.error('Falha ao atualizar a issue');
            throw e;
         })
         .then(() => {});
   },

   deleteIssue: (id: string) => {
      const snapshot = { issues: get().issues, issuesByStatus: get().issuesByStatus };
      set((state) => {
         const newIssues = state.issues.filter((issue) => issue.id !== id);
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      return api.issues
         .remove(id)
         .catch((e) => {
            set(snapshot);
            toast.error('Falha ao excluir a issue');
            throw e;
         })
         .then(() => {});
   },

   filterByStatus: (statusId) => get().issues.filter((i) => i.status.id === statusId),
   filterByPriority: (priorityId) => get().issues.filter((i) => i.priority.id === priorityId),
   // Casa QUALQUER responsável (principal ou colaborador); sem responsável = conjunto vazio.
   filterByAssignee: (userId) =>
      userId === null
         ? get().issues.filter((i) => i.assignee === null)
         : get().issues.filter((i) => i.assignees.some((a) => a.id === userId)),
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
            return i.assignees.some((a) => filters.assignee!.includes(a.id));
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
   // Espelha a regra do servidor no otimista: novo principal + colaboradores atuais (sem o
   // principal anterior); sem novo principal, o 1º colaborador é promovido.
   updateIssueAssignee: (issueId, newAssignee) => {
      const current = get().getIssueById(issueId);
      const collaborators = (current?.assignees ?? []).filter(
         (a) => a.id !== current?.assignee?.id && a.id !== newAssignee?.id
      );
      const assignees = newAssignee ? [newAssignee, ...collaborators] : collaborators;
      return get().updateIssue(issueId, { assignee: assignees[0] ?? null, assignees });
   },
   updateIssueAssignees: (issueId, assignees) => {
      const unique = assignees.filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);
      return get().updateIssue(issueId, { assignee: unique[0] ?? null, assignees: unique });
   },

   addIssueLabel: (issueId, label) => {
      const issue = get().getIssueById(issueId);
      if (!issue) return Promise.resolve();
      const snapshot = { issues: get().issues, issuesByStatus: get().issuesByStatus };
      set((state) => {
         const newIssues = state.issues.map((i) =>
            i.id === issueId ? { ...i, labels: [...i.labels, label] } : i
         );
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      return api.issues
         .addLabel(issueId, label.id)
         .catch((e) => {
            set(snapshot);
            toast.error('Falha ao adicionar a label');
            throw e;
         })
         .then(() => {});
   },

   removeIssueLabel: (issueId, labelId) => {
      const snapshot = { issues: get().issues, issuesByStatus: get().issuesByStatus };
      set((state) => {
         const newIssues = state.issues.map((i) =>
            i.id === issueId ? { ...i, labels: i.labels.filter((l) => l.id !== labelId) } : i
         );
         return { issues: newIssues, issuesByStatus: groupIssuesByStatus(newIssues) };
      });
      return api.issues
         .removeLabel(issueId, labelId)
         .catch((e) => {
            set(snapshot);
            toast.error('Falha ao remover a label');
            throw e;
         })
         .then(() => {});
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
