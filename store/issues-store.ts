import { Issue } from '@/data/issues';
import { LabelInterface } from '@/data/labels';
import { Priority } from '@/data/priorities';
import { Project } from '@/data/projects';
import { Status } from '@/data/status';
import { User } from '@/data/users';
import { create } from 'zustand';
import { toast } from 'sonner';
import { api } from '@/lib/client';
import { issueCursor } from '@/lib/issue-cursor';
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
   loading: boolean;
   /** false até a 1ª hidratação terminar com sucesso — antes disso a UI mostra carregando, não vazio. */
   loaded: boolean;
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
   /** Projeto/ciclo removido: limpa a referência nas issues (sem refetch). */
   detachProject: (projectId: string) => void;
   detachCycle: (cycleId: string) => void;
   /** Label renomeada/recolorida (evento remoto): reflete nas issues em memória, sem refetch. */
   patchLabel: (label: { id: string; name: string; color: string }) => void;
   /** Label apagada (evento remoto): sai das issues em memória. */
   dropLabel: (labelId: string) => void;

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
// Comparação binária (rank é ASCII): `localeCompare` custava caro a cada evento.
const byRank = (a: Issue, b: Issue) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);
const sortByRank = (issues: Issue[]) => [...issues].sort(byRank);

/** true quando `a` é estritamente mais velha que `b` (pelo `updatedAt` do servidor). */
const isOlder = (a: Issue, b: Issue) => !!a.updatedAt && !!b.updatedAt && a.updatedAt < b.updatedAt;

/**
 * `rankBetween` que nunca lança: vizinhos invertidos (lista velha no cliente, drags
 * concorrentes) são reordenados; empate ancora logo depois. Falha residual → null (o
 * chamador mantém o rank atual e o servidor devolve o real).
 */
function safeRankBetween(before: string | null, after: string | null): string | null {
   try {
      if (before && after) {
         if (before === after) return rankBetween(before, null);
         return before < after ? rankBetween(before, after) : rankBetween(after, before);
      }
      return rankBetween(before, after);
   } catch {
      return null;
   }
}

/** Token da hidratação corrente: uma hidratação que termina depois de outra mais nova é descartada. */
let hydrateSeq = 0;

/** Rollback de UMA issue: devolve só os campos `keys` ao valor de `prev`. */
function revertFields(state: IssuesState, id: string, prev: Issue, keys: (keyof Issue)[]) {
   return {
      issues: state.issues.map((i) => {
         if (i.id !== id) return i;
         const back: Record<string, unknown> = { ...i };
         for (const k of keys) back[k] = prev[k];
         return back as unknown as Issue;
      }),
   };
}

/** Carregando para a UI: hidratação em voo OU 1ª carga ainda não terminou (sem erro).
 *  Evita o flash de "Nenhuma issue" no deep-link frio, antes do hydrate começar. */
export const selectIssuesLoading = (s: IssuesState): boolean =>
   s.loading || (!s.loaded && !s.error);

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
   if ('parentId' in updated) patch.parentId = updated.parentId ?? null;
   return patch;
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
   // Estado inicial vazio; hydrate() carrega da API. `loaded:false` faz a tela mostrar
   // carregando (não "Nenhuma issue") até a 1ª carga terminar.
   issues: [],
   loading: false,
   loaded: false,
   error: false,

   hydrate: async (opts?: IssueListOptions) => {
      const seq = ++hydrateSeq;
      const stale = () => seq !== hydrateSeq;
      // Preenchimento PROGRESSIVO só na primeira carga (store vazio): a 1ª página
      // aparece rápido e as demais chegam em background. Num RE-hydrate (reconexão,
      // fallback do applyRemote) o store já tem dados — substituir página a página
      // faria o board ENCOLHER e re-crescer (mini-refresh); nesse caso acumula tudo
      // em silêncio e faz um set único no final.
      const progressive = get().issues.length === 0;
      set(progressive ? { loading: true, error: false } : { error: false });
      try {
         // Paginação KEYSET por rank (cursor = último rank): carrega TODAS as issues em
         // páginas (fim do truncamento silencioso do cap de 500).
         // Só pagina na ordem default (rank); em outras ordens, uma página (cap do server).
         // Página GRANDE de propósito: a paginação é keyset (a próxima precisa do rank
         // da anterior), então cada página é uma ida SEQUENCIAL ao servidor. Com 200,
         // 2.000 issues custavam 10 idas encadeadas; com 1.000, custam 2. A resposta é
         // comprimida (ver `compressJson`), então uma página de 1.000 pesa ~53 KB.
         const PAGE = 1000;
         const canPaginate = !opts?.orderBy || opts.orderBy === 'rank';
         // Cada página é adaptada UMA vez, ao chegar (não o acumulado a cada página).
         const acc: Issue[] = [];
         let cursor: string | undefined;
         for (let guard = 0; guard < 200; guard++) {
            const page = await api.issues.list({ ...opts, limit: PAGE, cursor });
            if (stale()) return; // outra hidratação começou depois: esta é descartada
            acc.push(...adaptIssues(page));
            const done = !canPaginate || page.length < PAGE;
            if (progressive || done) {
               const sorted = sortByRank(acc);
               set((state) => {
                  // Não sobrescreve item mais novo que já está no store (applyRemote que
                  // chegou durante a paginação).
                  const current = new Map(state.issues.map((i) => [i.id, i]));
                  const issues = sorted.map((fresh) => {
                     const cur = current.get(fresh.id);
                     return cur && isOlder(fresh, cur) ? cur : fresh;
                  });
                  return {
                     issues,
                     loading: !done && progressive,
                     loaded: state.loaded || done,
                     error: false,
                  };
               });
            }
            if (done) break;
            // keyset por (rank, id): empates de rank não pulam issues entre páginas (#25).
            cursor = issueCursor(page[page.length - 1]);
         }
      } catch {
         if (stale()) return;
         // mantém o estado atual e sinaliza a falha p/ o board.
         set({ loading: false, error: true });
      }
   },

   addIssue: (issue: Issue) => {
      set((state) => ({ issues: [...state.issues, issue] }));
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
            // Remove a otimista E uma eventual cópia que o evento `created` do SSE já
            // tenha inserido antes desta resposta (senão a issue aparecia duplicada).
            set((state) => ({
               issues: sortByRank([
                  ...state.issues.filter((i) => i.id !== issue.id && i.id !== fresh.id),
                  fresh,
               ]),
            }));
         })
         .catch((err) => {
            // Rollback DIRECIONADO: remove só a issue otimista (não clobra criações concorrentes).
            set((state) => ({ issues: state.issues.filter((i) => i.id !== issue.id) }));
            throw err;
         });
   },

   applyRemote: async (id: string) => {
      try {
         const dto = await api.issues.get(id);
         const fresh = adaptIssues([dto])[0];
         set((state) => {
            const cur = state.issues.find((i) => i.id === id);
            // Resposta mais velha que o que já está no store (GETs fora de ordem): ignora.
            if (cur && isOlder(fresh, cur)) return {};
            const next = cur
               ? state.issues.map((i) => (i.id === id ? fresh : i))
               : [...state.issues, fresh];
            return { issues: sortByRank(next) };
         });
      } catch {
         // GET falhou (issue deletada / erro) → reconcilia com um hydrate completo (raro).
         void get().hydrate();
      }
   },

   removeRemote: (id: string) => {
      set((state) => {
         if (!state.issues.some((i) => i.id === id)) return {};
         return { issues: state.issues.filter((i) => i.id !== id) };
      });
   },

   detachProject: (projectId) =>
      set((state) =>
         state.issues.some((i) => i.project?.id === projectId)
            ? {
                 issues: state.issues.map((i) =>
                    i.project?.id === projectId ? { ...i, project: undefined } : i
                 ),
              }
            : {}
      ),
   detachCycle: (cycleId) =>
      set((state) =>
         state.issues.some((i) => i.cycleId === cycleId)
            ? {
                 issues: state.issues.map((i) =>
                    i.cycleId === cycleId ? { ...i, cycleId: '' } : i
                 ),
              }
            : {}
      ),

   patchLabel: (label) =>
      set((state) =>
         state.issues.some((i) => i.labels.some((l) => l.id === label.id))
            ? {
                 issues: state.issues.map((i) =>
                    i.labels.some((l) => l.id === label.id)
                       ? {
                            ...i,
                            labels: i.labels.map((l) =>
                               l.id === label.id
                                  ? { ...l, name: label.name, color: label.color }
                                  : l
                            ),
                         }
                       : i
                 ),
              }
            : {}
      ),
   dropLabel: (labelId) =>
      set((state) =>
         state.issues.some((i) => i.labels.some((l) => l.id === labelId))
            ? {
                 issues: state.issues.map((i) =>
                    i.labels.some((l) => l.id === labelId)
                       ? { ...i, labels: i.labels.filter((l) => l.id !== labelId) }
                       : i
                 ),
              }
            : {}
      ),

   // Retorna a promise e RE-LANÇA no erro (após rollback + toast.error): assim os
   // chamadores (⌘K, bulk) podem toastar sucesso SÓ quando a API confirma, sem o
   // duplo-toast contraditório. O toast de erro segue fonte única aqui.
   updateIssue: (id: string, updatedIssue: Partial<Issue>) => {
      // Rollback DIRECIONADO: só os campos alterados desta issue (não o store inteiro,
      // que apagaria mudanças remotas que chegaram no intervalo).
      const prev = get().getIssueById(id);
      const keys = Object.keys(updatedIssue) as (keyof Issue)[];
      // Issue FORA do store (deep-link frio, ⌘K/context menu antes do hydrate): não há
      // otimista possível, mas a API é chamada e o resultado entra por `applyRemote`
      // (upsert) — a tela passa a ler do store e reflete a mudança.
      const inStore = prev !== undefined;
      set((state) => ({
         issues: state.issues.map((issue) =>
            issue.id === id ? { ...issue, ...updatedIssue } : issue
         ),
      }));
      return api.issues
         .update(id, toUpdateInput(updatedIssue))
         .catch((e) => {
            if (prev) set((state) => revertFields(state, id, prev, keys));
            toast.error('Falha ao atualizar a issue');
            throw e;
         })
         .then(() => {
            if (!inStore) return get().applyRemote(id);
         });
   },

   deleteIssue: (id: string) => {
      const removed = get().getIssueById(id);
      set((state) => ({ issues: state.issues.filter((issue) => issue.id !== id) }));
      return api.issues
         .remove(id)
         .catch((e) => {
            // Rollback direcionado: devolve só a issue apagada (na posição do rank).
            if (removed)
               set((state) =>
                  state.issues.some((i) => i.id === id)
                     ? {}
                     : { issues: sortByRank([...state.issues, removed]) }
               );
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
      // Fora do store: ainda persiste e entra por `applyRemote` (mesma regra do updateIssue).
      const inStore = get().getIssueById(issueId) !== undefined;
      set((state) => ({
         issues: state.issues.map((i) =>
            i.id === issueId ? { ...i, labels: [...i.labels, label] } : i
         ),
      }));
      return api.issues
         .addLabel(issueId, label.id)
         .catch((e) => {
            // Rollback direcionado: tira só esta label desta issue.
            set((state) => ({
               issues: state.issues.map((i) =>
                  i.id === issueId ? { ...i, labels: i.labels.filter((l) => l.id !== label.id) } : i
               ),
            }));
            toast.error('Falha ao adicionar a label');
            throw e;
         })
         .then(() => {
            if (!inStore) return get().applyRemote(issueId);
         });
   },

   removeIssueLabel: (issueId, labelId) => {
      const inStore = get().getIssueById(issueId) !== undefined;
      const removedLabel = get()
         .getIssueById(issueId)
         ?.labels.find((l) => l.id === labelId);
      set((state) => ({
         issues: state.issues.map((i) =>
            i.id === issueId ? { ...i, labels: i.labels.filter((l) => l.id !== labelId) } : i
         ),
      }));
      return api.issues
         .removeLabel(issueId, labelId)
         .catch((e) => {
            // Rollback direcionado: devolve só esta label a esta issue.
            if (removedLabel)
               set((state) => ({
                  issues: state.issues.map((i) =>
                     i.id === issueId && !i.labels.some((l) => l.id === labelId)
                        ? { ...i, labels: [...i.labels, removedLabel] }
                        : i
                  ),
               }));
            toast.error('Falha ao remover a label');
            throw e;
         })
         .then(() => {
            if (!inStore) return get().applyRemote(issueId);
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
      const optimisticRank = safeRankBetween(rankOf(beforeId), rankOf(afterId)) ?? prevRank;

      const applyRank = (rank: string) => (state: IssuesState) => ({
         issues: sortByRank(state.issues.map((i) => (i.id === id ? { ...i, rank } : i))),
      });
      set(applyRank(optimisticRank));

      api.issues
         .reorder(id, beforeId, afterId)
         .then((dto) => {
            // Reconcilia com o rank REAL do servidor (splice de 1 item).
            const fresh = adaptIssues([dto])[0];
            set((state) => ({
               issues: sortByRank(state.issues.map((i) => (i.id === id ? fresh : i))),
            }));
         })
         .catch(() => {
            set(applyRank(prevRank)); // rollback só desta issue
            toast.error('Falha ao reordenar a issue');
         });
   },

   getIssueById: (id) => get().issues.find((i) => i.id === id),
}));
