import { Issue } from '@/data/issues';
import { LabelInterface } from '@/data/labels';
import { Priority } from '@/data/priorities';
import { Project } from '@/data/projects';
import { Status } from '@/data/status';
import { User } from '@/data/users';
import { create } from 'zustand';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/client';
import { markOwnMutation } from '@/lib/client-id';
import { issueCursor } from '@/lib/issue-cursor';
import { adaptIssues } from '@/lib/adapters';
import { rankBetween } from '@/lib/api/rank';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useCatalogStore } from '@/store/catalog-store';
import type {
   CreateIssueInput,
   IssueDto,
   UpdateIssueInput,
   IssueListOptions,
} from '@/lib/api/issues';

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

   /** Resync incremental (#14): só o delta desde a marca d'água; cai no `hydrate` se o
    *  store está vazio ou o delta veio truncado. */
   resync: () => Promise<void>;

   /** Sync em tempo real TARGETED: re-busca UMA issue e faz splice no store (sem
    *  re-hidratar as ~500). 404 remove; erro transitório tenta uma vez de novo (If#23). */
   applyRemote: (id: string) => Promise<void>;
   /** Upsert de UM DTO do servidor (resposta de mutação, fetch direcionado); ignora o
    *  que for mais velho que o item do store. */
   applyDto: (dto: IssueDto) => void;
   /** Remove UMA issue do store (evento remoto de delete) — sem refetch. */
   removeRemote: (id: string) => void;
   /** Projeto/ciclo removido: limpa a referência nas issues (sem refetch). */
   detachProject: (projectId: string) => void;
   detachCycle: (cycleId: string) => void;
   /** Label renomeada/recolorida (evento remoto): reflete nas issues em memória, sem refetch. */
   patchLabel: (label: { id: string; name: string; color: string }) => void;
   /** Label apagada (evento remoto): sai das issues em memória. */
   dropLabel: (labelId: string) => void;

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

/** Token da hidratação corrente: uma hidratação que termina depois de outra mais nova é descartada. */
let hydrateSeq = 0;

/**
 * Rollback de UMA issue (#17): devolve ao valor de `prev` só os campos que AINDA estão
 * com o valor otimista. Se um evento remoto trocou o campo no meio, o valor remoto fica.
 */
function revertFields(
   state: IssuesState,
   id: string,
   prev: Issue,
   optimistic: Partial<Issue>,
   keys: (keyof Issue)[]
) {
   const cur = state.issues.find((i) => i.id === id);
   if (!cur) return {};
   const back: Record<string, unknown> = { ...cur };
   let changed = false;
   for (const k of keys) {
      if (cur[k] !== optimistic[k]) continue;
      back[k] = prev[k];
      changed = true;
   }
   if (!changed) return {};
   return { issues: state.issues.map((i) => (i.id === id ? (back as unknown as Issue) : i)) };
}

/**
 * Mutações em voo por issue: a resposta só é aplicada quando é a ÚLTIMA — senão a
 * resposta da 1ª edição pisaria no otimista da 2ª, ainda em voo. Também marca a
 * mutação como desta aba: o eco SSE dela não refaz o GET (If#16).
 */
const inFlight = new Map<string, number>();
function beginMutation(id: string): () => boolean {
   inFlight.set(id, (inFlight.get(id) ?? 0) + 1);
   markOwnMutation('issue', id);
   let finished = false;
   return () => {
      if (finished) return false;
      finished = true;
      const left = (inFlight.get(id) ?? 1) - 1;
      if (left <= 0) inFlight.delete(id);
      else inFlight.set(id, left);
      return left <= 0;
   };
}

/** Issues otimistas ainda sem resposta do POST: o resync não as trata como lápide. */
const pendingCreates = new Set<string>();

/** Margem da marca d'água do resync: cobre relógio adiantado de outro pod. */
const RESYNC_MARGIN_MS = 60_000;

function upsertDto(issues: Issue[], dto: IssueDto): Issue[] {
   const fresh = adaptIssues([dto])[0];
   const cur = issues.find((i) => i.id === dto.id);
   // Resposta mais velha que o que já está no store (GETs fora de ordem): ignora.
   if (cur && isOlder(fresh, cur)) return issues;
   const next = cur ? issues.map((i) => (i.id === dto.id ? fresh : i)) : [...issues, fresh];
   return sortByRank(next);
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
      pendingCreates.add(issue.id);
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
            pendingCreates.delete(issue.id);
            markOwnMutation('issue', dto.id);
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
            pendingCreates.delete(issue.id);
            // Rollback DIRECIONADO: remove só a issue otimista (não clobra criações concorrentes).
            set((state) => ({ issues: state.issues.filter((i) => i.id !== issue.id) }));
            throw err;
         });
   },

   resync: async () => {
      const { issues, loaded } = get();
      if (!loaded || issues.length === 0) return get().hydrate();
      // Marca d'água = maior `updatedAt` do store (relógio do SERVIDOR, não da aba).
      let mark = '';
      for (const i of issues) if (i.updatedAt && i.updatedAt > mark) mark = i.updatedAt;
      if (!mark) return get().hydrate();
      const since = new Date(new Date(mark).getTime() - RESYNC_MARGIN_MS).toISOString();
      const seq = hydrateSeq;
      try {
         const { data, meta } = await api.issues.changes(since);
         if (seq !== hydrateSeq) return; // uma hidratação completa começou no meio
         if (meta?.truncated || !meta?.ids) return get().hydrate();
         const alive = new Set(meta.ids);
         set((state) => {
            let next = state.issues;
            for (const dto of data) next = upsertDto(next, dto);
            // Lápides: sumiu dos ids vivos = apagada ou fora do escopo (a otimista fica).
            const kept = next.filter((i) => alive.has(i.id) || pendingCreates.has(i.id));
            return kept.length === state.issues.length && next === state.issues
               ? {}
               : { issues: kept };
         });
      } catch {
         if (seq === hydrateSeq) await get().hydrate();
      }
   },

   applyDto: (dto) =>
      set((state) => {
         const issues = upsertDto(state.issues, dto);
         return issues === state.issues ? {} : { issues };
      }),

   applyRemote: async (id: string) => {
      const fetchOnce = () => api.issues.get(id);
      let dto: IssueDto;
      try {
         try {
            dto = await fetchOnce();
         } catch (e) {
            if (e instanceof ApiError && e.status === 404) throw e;
            dto = await fetchOnce(); // erro transitório: UMA nova tentativa (If#23)
         }
      } catch (e) {
         // Apagada (ou fora do escopo): sai do store. Outro erro: mantém o que há —
         // o próximo evento/resync reconcilia, sem baixar o board inteiro.
         if (e instanceof ApiError && (e.status === 404 || e.status === 403))
            get().removeRemote(id);
         return;
      }
      get().applyDto(dto);
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
      // otimista possível, mas a API é chamada e o DTO da RESPOSTA entra no store (upsert,
      // sem GET extra — If#16); a tela passa a ler do store e reflete a mudança.
      const done = beginMutation(id);
      set((state) => ({
         issues: state.issues.map((issue) =>
            issue.id === id ? { ...issue, ...updatedIssue } : issue
         ),
      }));
      return api.issues
         .update(id, toUpdateInput(updatedIssue))
         .catch((e) => {
            done();
            if (prev) set((state) => revertFields(state, id, prev, updatedIssue, keys));
            toast.error('Falha ao atualizar a issue');
            throw e;
         })
         .then((dto) => {
            if (done() && dto?.id) get().applyDto(dto);
         });
   },

   deleteIssue: (id: string) => {
      markOwnMutation('issue', id);
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
      // Fora do store: ainda persiste e o DTO da resposta entra no store (If#16).
      const done = beginMutation(issueId);
      set((state) => ({
         issues: state.issues.map((i) =>
            i.id === issueId ? { ...i, labels: [...i.labels, label] } : i
         ),
      }));
      return api.issues
         .addLabel(issueId, label.id)
         .catch((e) => {
            done();
            // Rollback direcionado: tira só esta label desta issue.
            set((state) => ({
               issues: state.issues.map((i) =>
                  i.id === issueId ? { ...i, labels: i.labels.filter((l) => l.id !== label.id) } : i
               ),
            }));
            toast.error('Falha ao adicionar a label');
            throw e;
         })
         .then((dto) => {
            if (done() && dto?.id) get().applyDto(dto);
         });
   },

   removeIssueLabel: (issueId, labelId) => {
      const done = beginMutation(issueId);
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
            done();
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
         .then((dto) => {
            if (done() && dto?.id) get().applyDto(dto);
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

      const applyRank = (rank: string) => (state: IssuesState) => ({
         issues: sortByRank(state.issues.map((i) => (i.id === id ? { ...i, rank } : i))),
      });
      set(applyRank(optimisticRank));
      const done = beginMutation(id);

      api.issues
         .reorder(id, beforeId, afterId)
         .then((dto) => {
            // Reconcilia com o rank REAL do servidor (splice de 1 item).
            if (done() && dto?.id) get().applyDto(dto);
         })
         .catch(() => {
            done();
            // Rollback só desta issue e só se o rank ainda é o otimista (#17).
            if (get().getIssueById(id)?.rank === optimisticRank) set(applyRank(prevRank));
            toast.error('Falha ao reordenar a issue');
         });
   },

   getIssueById: (id) => get().issues.find((i) => i.id === id),
}));

/**
 * Status renomeado/recolorido no catálogo (#16) reflete nas issues em memória, sem
 * refetch. Só troca o objeto quando a aparência mudou: re-hidratar o bootstrap recria
 * os Status, mas issue cujo status não mudou mantém a referência (sem re-render).
 */
useCatalogStore.subscribe((next, prev) => {
   if (next.statuses === prev.statuses) return;
   const byId = new Map(next.statuses.map((st) => [st.id, st]));
   useIssuesStore.setState((state) => {
      let changed = false;
      const issues = state.issues.map((i) => {
         const st = byId.get(i.status.id);
         if (
            !st ||
            st === i.status ||
            (st.name === i.status.name &&
               st.color === i.status.color &&
               st.category === i.status.category &&
               st.icon === i.status.icon)
         )
            return i;
         changed = true;
         return { ...i, status: st };
      });
      return changed ? { issues } : {};
   });
});
