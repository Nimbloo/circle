import { create } from 'zustand';
import { Project } from '@/data/projects';
import { Team } from '@/data/teams';
import { User } from '@/data/users';
import { Cycle } from '@/data/cycles';
import { Initiative } from '@/data/initiatives';
import { View } from '@/data/views';
import {
   adaptProject,
   adaptTeam,
   adaptMemberToUser,
   adaptCycle,
   adaptInitiative,
   adaptView,
} from '@/lib/adapters-workspace';
import type { TeamFull } from '@/lib/api/workspace';
import type { MeDto } from '@/lib/api/users';
import type { ProjectDto, UpdateProjectInput } from '@/lib/api/projects';
import type { InitiativeDto } from '@/lib/api/initiatives';
import type { TeamDto } from '@/lib/api/teams';
import type { MemberDto } from '@/lib/api/members';
import type { CycleDto } from '@/lib/api/cycles';
import type { ViewDto } from '@/lib/api/views';
import { useCatalogStore } from '@/store/catalog-store';
// Import circular (issues-store também lê este store), seguro: os dois só se usam dentro de ações.
import { useIssuesStore } from '@/store/issues-store';
import { api } from '@/lib/client';
import { toast } from 'sonner';

/** Team das rotas de escrita (TeamDto, sem members) ou do bootstrap (TeamFull). */
export type TeamLike = TeamDto & Partial<Pick<TeamFull, 'members'>>;

interface WorkspaceState {
   loaded: boolean;
   loading: boolean;
   /** O último bootstrap falhou: o shell troca o skeleton por erro com retry (#16). */
   loadError: boolean;
   me: MeDto | null;
   projects: Project[];
   teams: Team[];
   users: User[];
   cycles: Cycle[];
   initiatives: Initiative[];
   views: View[];

   hydrate: (opts?: { rollover?: boolean }) => Promise<void>;

   /** Splice de UMA entidade a partir do DTO do servidor (após uma mutação), em vez de
    * re-hidratar o workspace inteiro — mesmo padrão do issues-store. Cada apply/remove
    * também mantém as CÓPIAS derivadas coerentes (`initiatives[].projectIds`, `projects[].initiative`, membership em `teams[].members`,
    * `owner` de initiatives/views), sem tocar nas demais coleções. */
   applyProject: (dto: ProjectDto) => void;
   /** PATCH otimista de um projeto (DnD do board, reschedule da timeline): aplica `local`
    * na hora, persiste `body` e, no erro, faz rollback + toast e re-lança. O sucesso é
    * silencioso (o DTO do servidor entra via `applyProject`). */
   patchProject: (id: string, local: Partial<Project>, body: UpdateProjectInput) => Promise<void>;
   applyInitiative: (dto: InitiativeDto) => void;
   removeProjectLocal: (id: string) => void;
   removeInitiativeLocal: (id: string) => void;
   applyTeam: (dto: TeamLike) => void;
   removeTeamLocal: (id: string) => void;
   /** Lista de membros de um time (retorno de addMember/removeMember/leave). */
   applyTeamMembers: (teamId: string, members: MemberDto[]) => void;
   applyCycle: (dto: CycleDto) => void;
   removeCycleLocal: (id: string) => void;
   applyView: (dto: ViewDto) => void;
   removeViewLocal: (id: string) => void;
   /** Atualiza `users` e, pelo `teamIds` do DTO, a membership em `teams`. */
   applyUser: (dto: MemberDto) => void;
   /** Perfil do usuário atual (retorno de /me): atualiza `me` e o `users` correspondente. */
   applyMe: (dto: MeDto) => void;

   /** Segue/deixa de seguir uma issue (otimista + rollback). Reflete em me.subscribedIssueIds. */
   toggleSubscription: (issueId: string) => void;
   /**
    * Issue fechada fica fora do `me.subscribedIssueIds` (bootstrap enxuto): consulta a
    * assinatura dela e, se seguida, inclui na lista local (o toggle segue funcionando).
    */
   ensureSubscriptionKnown: (issueId: string) => Promise<void>;
   isSubscribed: (issueId: string) => boolean;

   // Helpers (mesmos nomes dos mocks)
   getProjectById: (id: string) => Project | undefined;
   getProjectsByTeam: (teamId: string) => Project[];
   getTeamById: (id: string) => Team | undefined;
   getUserById: (id: string) => User | undefined;
   getInitiativeById: (id: string) => Initiative | undefined;
   getInitiativeProjects: (id: string) => Project[];
   countCompletedProjects: (id: string) => { completed: number; total: number };
   getCyclesByTeam: (teamId: string) => Cycle[];
   getCurrentCycle: (teamId?: string) => Cycle | undefined;
   getUpcomingCycle: (teamId?: string) => Cycle | undefined;
   getCycleById: (id: string) => Cycle | undefined;
   getViewById: (id: string) => View | undefined;
}

/** Fetch do bootstrap em voo e a repetição única agendada (ver `hydrate`). */
let inFlight: Promise<void> | null = null;
let queued: Promise<void> | null = null;

/* ------------------------- Reconciliação do bootstrap ------------------------- */

/**
 * If#15: re-hidratar o bootstrap NÃO recria o que não mudou. Guardamos o JSON do último
 * DTO de cada item; igual → o item adaptado atual (mesma referência) é reaproveitado, e
 * a lista inteira também quando nada mudou — sem re-render à toa. `apply*`/`remove*`
 * ganham um selo de sequência: o que foi aplicado DEPOIS de o bootstrap começar é mais
 * novo que o snapshot dele e vence.
 */
type Kind = 'project' | 'team' | 'user' | 'cycle' | 'initiative' | 'view';
const lastJson = new Map<string, string>();
const touchedAt = new Map<string, number>();
let touchSeq = 0;
const touch = (kind: Kind, id: string) => touchedAt.set(`${kind}:${id}`, ++touchSeq);
const remember = (kind: Kind, id: string, dto: unknown) =>
   lastJson.set(`${kind}:${id}`, JSON.stringify(dto));

function reconcile<D extends { id: string }, T extends { id: string }>(
   kind: Kind,
   dtos: D[],
   current: T[],
   since: number,
   adapt: (d: D) => T,
   stillValid: (cur: T) => boolean = () => true
): T[] {
   const byId = new Map(current.map((x) => [x.id, x]));
   const out: T[] = [];
   for (const d of dtos) {
      const key = `${kind}:${d.id}`;
      const cur = byId.get(d.id);
      // Mexido localmente depois do início do fetch: o local é mais novo que o snapshot.
      if ((touchedAt.get(key) ?? 0) > since) {
         if (cur) out.push(cur);
         continue;
      }
      const json = JSON.stringify(d);
      if (cur && lastJson.get(key) === json && stillValid(cur)) {
         out.push(cur);
         continue;
      }
      lastJson.set(key, json);
      out.push(adapt(d));
   }
   // Criado localmente depois do início do fetch (ainda fora do snapshot): fica.
   for (const cur of current)
      if (!dtos.some((d) => d.id === cur.id) && (touchedAt.get(`${kind}:${cur.id}`) ?? 0) > since)
         out.push(cur);
   const same = out.length === current.length && out.every((x, i) => x === current[i]);
   return same ? current : out;
}

/* ------------------------------ Helpers de splice ------------------------------ */

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
   return list.some((x) => x.id === item.id)
      ? list.map((x) => (x.id === item.id ? item : x))
      : [...list, item];
}

/** `map` que devolve a MESMA referência quando nenhum item mudou (sem re-render à toa). */
function mapIfChanged<T>(list: T[], fn: (x: T) => T): T[] {
   let changed = false;
   const next = list.map((x) => {
      const y = fn(x);
      if (y !== x) changed = true;
      return y;
   });
   return changed ? next : list;
}

type UserSlices = Pick<WorkspaceState, 'users' | 'teams' | 'initiatives' | 'views'>;

/** Propaga UM User para todo lugar que carrega cópia dele: `users`, a membership em
 * `teams` (entra/sai conforme `teamIds`) e o `owner` de initiatives/views. */
function spliceUser(s: UserSlices, user: User): UserSlices {
   const memberOf = new Set(user.teamIds);
   return {
      users: upsert(s.users, user),
      teams: mapIfChanged(s.teams, (t) => {
         if (memberOf.has(t.id)) return { ...t, members: upsert(t.members, user) };
         return t.members.some((m) => m.id === user.id)
            ? { ...t, members: t.members.filter((m) => m.id !== user.id) }
            : t;
      }),
      initiatives: mapIfChanged(s.initiatives, (i) =>
         i.owner?.id === user.id ? { ...i, owner: user } : i
      ),
      views: mapIfChanged(s.views, (v) => (v.owner.id === user.id ? { ...v, owner: user } : v)),
   };
}

/** Reflete em `me` os campos compartilhados com o User de mesmo id (admin NÃO vem do role). */
function syncMe(me: MeDto | null, user: User): MeDto | null {
   if (!me || me.id !== user.id) return me;
   return {
      ...me,
      name: user.name,
      email: user.email,
      slug: user.slug ?? me.slug,
      avatarUrl: user.avatarUrl || null,
      role: user.role,
      teamIds: user.teamIds,
   };
}

const dropId = (ids: string[], id: string) => ids.filter((x) => x !== id);

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
   loaded: false,
   loading: false,
   loadError: false,
   me: null,
   projects: [],
   teams: [],
   users: [],
   cycles: [],
   initiatives: [],
   views: [],

   hydrate: (opts) => {
      // Coalescência: com um fetch em voo, a chamada nova NÃO é descartada (antes era —
      // e o refresh pós-mutação sumia quando um refetch de SSE estava no ar). Ela espera
      // o atual terminar e roda mais uma vez; várias chamadas nesse meio tempo viram uma.
      if (inFlight) {
         if (!queued) {
            queued = inFlight.then(() => {
               queued = null;
               return get().hydrate(opts);
            });
         }
         return queued;
      }
      inFlight = (async () => {
         set({ loading: true });
         const since = touchSeq;
         try {
            // Só o boot da página pede rollover (escrita); refetches ficam na leitura.
            const data = await api.workspace({ rollover: opts?.rollover });
            // Catálogos (status/priority/label/health) já vêm no bootstrap — populamos
            // o catalog-store a partir daqui, sem fetch duplicado.
            useCatalogStore.getState().setCatalogs(data);
            const s = get();
            const users = reconcile('user', data.members, s.users, since, adaptMemberToUser);
            const usersById = new Map(users.map((u) => [u.id, u]));
            // Initiative/view carregam o User do dono: só reaproveita se ele não mudou.
            const ownerOk = (owner: User | undefined, id: string | undefined) =>
               !id || owner === usersById.get(id);
            set({
               me: s.me && JSON.stringify(s.me) === JSON.stringify(data.me) ? s.me : data.me,
               projects: reconcile('project', data.projects, s.projects, since, adaptProject),
               teams: reconcile('team', data.teams, s.teams, since, adaptTeam),
               users,
               cycles: reconcile('cycle', data.cycles, s.cycles, since, adaptCycle),
               initiatives: reconcile(
                  'initiative',
                  data.initiatives,
                  s.initiatives,
                  since,
                  (i) => adaptInitiative(i, usersById),
                  (cur) => ownerOk(cur.owner, cur.owner?.id)
               ),
               views: reconcile(
                  'view',
                  data.views,
                  s.views,
                  since,
                  (v) => adaptView(v, usersById),
                  (cur) => ownerOk(cur.owner, cur.owner?.id)
               ),
               loaded: true,
               loading: false,
               loadError: false,
            });
         } catch {
            set({ loading: false, loadError: true });
         } finally {
            inFlight = null;
         }
      })();
      return inFlight;
   },

   applyProject: (dto) => {
      touch('project', dto.id);
      remember('project', dto.id, dto);
      const adapted = adaptProject(dto);
      set((s) => ({
         projects: upsert(s.projects, adapted),
         // Vínculo relacional: o projeto entra no `projectIds` da initiative nova e sai da antiga.
         initiatives: mapIfChanged(s.initiatives, (i) => {
            const linked = i.projectIds.includes(adapted.id);
            if (i.id === dto.initiativeId)
               return linked ? i : { ...i, projectIds: [...i.projectIds, adapted.id] };
            return linked ? { ...i, projectIds: dropId(i.projectIds, adapted.id) } : i;
         }),
      }));
   },
   patchProject: (id, local, body) => {
      const prev = get().projects.find((p) => p.id === id);
      if (!prev) return Promise.resolve();
      touch('project', id);
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...local } : p)) }));
      const keys = Object.keys(local) as (keyof Project)[];
      return api.projects
         .update(id, body)
         .then((dto) => get().applyProject(dto))
         .catch((e) => {
            // Rollback POR CAMPO (#17): só o que ainda está com o valor otimista volta;
            // o que um evento remoto trocou no meio fica.
            set((s) => ({
               projects: mapIfChanged(s.projects, (p) => {
                  if (p.id !== id) return p;
                  const back: Record<string, unknown> = { ...p };
                  let changed = false;
                  for (const k of keys) {
                     if (p[k] !== local[k]) continue;
                     back[k] = prev[k];
                     changed = true;
                  }
                  return changed ? (back as unknown as Project) : p;
               }),
            }));
            // Erro de API (tem `status`) traz a explicação do servidor, ex.: 409 (F2, #43).
            const apiMessage =
               e instanceof Error && typeof (e as { status?: unknown }).status === 'number'
                  ? e.message
                  : null;
            toast.error(apiMessage || 'Could not update the project');
            throw e;
         });
   },
   applyInitiative: (dto) => {
      touch('initiative', dto.id);
      remember('initiative', dto.id, dto);
      const usersById = new Map(get().users.map((u) => [u.id, u]));
      const adapted = adaptInitiative(dto, usersById);
      const linked = new Set(adapted.projectIds);
      set((s) => ({
         initiatives: upsert(s.initiatives, adapted),
         // Espelho do vínculo no projeto (`projects[].initiative`), lido pelo detalhe/menu.
         projects: mapIfChanged(s.projects, (p) => {
            if (linked.has(p.id))
               return p.initiative === adapted.id ? p : { ...p, initiative: adapted.id };
            return p.initiative === adapted.id ? { ...p, initiative: undefined } : p;
         }),
      }));
   },
   removeProjectLocal: (id) => {
      touch('project', id);
      // Issues que apontavam pro projeto removido perdem a referência (#13).
      useIssuesStore.getState().detachProject(id);
      set((s) => ({
         projects: s.projects.filter((p) => p.id !== id),
         initiatives: mapIfChanged(s.initiatives, (i) =>
            i.projectIds.includes(id) ? { ...i, projectIds: dropId(i.projectIds, id) } : i
         ),
      }));
   },
   removeInitiativeLocal: (id) => {
      touch('initiative', id);
      set((s) => ({
         initiatives: s.initiatives.filter((i) => i.id !== id),
         projects: mapIfChanged(s.projects, (p) =>
            p.initiative === id ? { ...p, initiative: undefined } : p
         ),
      }));
   },

   applyTeam: (dto) => {
      touch('team', dto.id);
      set((s) => {
         const prev = s.teams.find((t) => t.id === dto.id);
         const adapted = adaptTeam({ ...dto, members: dto.members ?? [] });
         // Rotas de escrita devolvem TeamDto sem members: preserva a cópia do store.
         if (!dto.members) adapted.members = prev?.members ?? [];
         const base: UserSlices = { ...s, teams: upsert(s.teams, adapted) };
         // Time recém-criado: `createTeam` já insere quem criou como membro e o DTO só
         // sinaliza `joined` — refletimos a membership sem esperar o bootstrap.
         const creator =
            !prev && dto.joined && !dto.members && s.me
               ? s.users.find((u) => u.id === s.me?.id)
               : undefined;
         if (!creator || creator.teamIds.includes(dto.id)) return base;
         const member: User = { ...creator, teamIds: [...creator.teamIds, dto.id] };
         return { ...spliceUser(base, member), me: syncMe(s.me, member) };
      });
   },
   removeTeamLocal: (id) => {
      touch('team', id);
      // A exclusão é em cascata: projetos, ciclos, views e issues do time somem junto.
      const s0 = get();
      const projectIds = s0.projects.filter((p) => p.teamId === id).map((p) => p.id);
      const cycleIds = s0.cycles.filter((c) => c.teamId === id).map((c) => c.id);
      for (const pid of projectIds) touch('project', pid);
      for (const cid of cycleIds) touch('cycle', cid);
      for (const v of s0.views) if (v.teamId === id) touch('view', v.id);
      useIssuesStore.getState().dropTeam(id, projectIds, cycleIds);
      const goneProjects = new Set(projectIds);
      set((s) => ({
         teams: s.teams.filter((t) => t.id !== id),
         projects: projectIds.length ? s.projects.filter((p) => p.teamId !== id) : s.projects,
         cycles: cycleIds.length ? s.cycles.filter((c) => c.teamId !== id) : s.cycles,
         views: s.views.some((v) => v.teamId === id)
            ? s.views.filter((v) => v.teamId !== id)
            : s.views,
         initiatives: goneProjects.size
            ? mapIfChanged(s.initiatives, (i) =>
                 i.projectIds.some((pid) => goneProjects.has(pid))
                    ? { ...i, projectIds: i.projectIds.filter((pid) => !goneProjects.has(pid)) }
                    : i
              )
            : s.initiatives,
         users: mapIfChanged(s.users, (u) =>
            u.teamIds.includes(id) ? { ...u, teamIds: dropId(u.teamIds, id) } : u
         ),
         me: s.me?.teamIds.includes(id) ? { ...s.me, teamIds: dropId(s.me.teamIds, id) } : s.me,
      }));
   },
   applyTeamMembers: (teamId, members) =>
      set((s) => {
         const keep = new Set(members.map((m) => m.id));
         let next: UserSlices = s;
         let me = s.me;
         for (const m of members) {
            const user = adaptMemberToUser(m);
            next = spliceUser(next, user);
            me = syncMe(me, user);
         }
         // Quem não veio na lista saiu do time: some de `members` e perde o id em `teamIds`.
         const teams = mapIfChanged(next.teams, (t) =>
            t.id !== teamId
               ? t
               : {
                    ...t,
                    members: t.members.filter((u) => keep.has(u.id)),
                    joined: me ? keep.has(me.id) : t.joined,
                 }
         );
         const users = mapIfChanged(next.users, (u) =>
            keep.has(u.id) || !u.teamIds.includes(teamId)
               ? u
               : { ...u, teamIds: dropId(u.teamIds, teamId) }
         );
         if (me && !keep.has(me.id) && me.teamIds.includes(teamId))
            me = { ...me, teamIds: dropId(me.teamIds, teamId) };
         return { ...next, teams, users, me };
      }),

   applyCycle: (dto) => {
      touch('cycle', dto.id);
      remember('cycle', dto.id, dto);
      set((s) => ({ cycles: upsert(s.cycles, adaptCycle(dto)) }));
   },
   removeCycleLocal: (id) => {
      touch('cycle', id);
      useIssuesStore.getState().detachCycle(id); // issues do ciclo removido voltam ao backlog
      set((s) => ({ cycles: s.cycles.filter((c) => c.id !== id) }));
   },

   applyView: (dto) => {
      touch('view', dto.id);
      set((s) => {
         const usersById = new Map(s.users.map((u) => [u.id, u]));
         return { views: upsert(s.views, adaptView(dto, usersById)) };
      });
   },
   removeViewLocal: (id) => {
      touch('view', id);
      set((s) => ({ views: s.views.filter((v) => v.id !== id) }));
   },

   applyUser: (dto) =>
      set((s) => {
         touch('user', dto.id);
         const user = adaptMemberToUser(dto);
         return { ...spliceUser(s, user), me: syncMe(s.me, user) };
      }),
   applyMe: (dto) =>
      set((s) => {
         const prev = s.users.find((u) => u.id === dto.id);
         // MeDto não traz presença/timezone/joinedAt: herda do User já carregado.
         const user: User = {
            status: 'offline',
            joinedDate: '',
            timezone: 'UTC',
            ...prev,
            id: dto.id,
            name: dto.name,
            email: dto.email,
            slug: dto.slug,
            avatarUrl: dto.avatarUrl ?? '',
            role: dto.role as User['role'],
            teamIds: dto.teamIds,
         };
         return { ...spliceUser(s, user), me: dto };
      }),

   isSubscribed: (issueId) => get().me?.subscribedIssueIds.includes(issueId) ?? false,

   ensureSubscriptionKnown: async (issueId) => {
      if (get().me?.subscribedIssueIds.includes(issueId)) return;
      try {
         const { subscribed } = await api.issues.subscription(issueId);
         const cur = get().me;
         if (subscribed && cur && !cur.subscribedIssueIds.includes(issueId))
            set({ me: { ...cur, subscribedIssueIds: [...cur.subscribedIssueIds, issueId] } });
      } catch {
         // Best-effort: sem a consulta o botão só mostra "não seguindo" como antes.
      }
   },

   toggleSubscription: (issueId) => {
      const me = get().me;
      if (!me) return;
      const currently = me.subscribedIssueIds.includes(issueId);
      const nextIds = currently
         ? me.subscribedIssueIds.filter((id) => id !== issueId)
         : [...me.subscribedIssueIds, issueId];
      set({ me: { ...me, subscribedIssueIds: nextIds } });
      const call = currently ? api.issues.unsubscribe(issueId) : api.issues.subscribe(issueId);
      void call.catch(() => {
         // Rollback SÓ desta issue (#17): a lista pode ter mudado no meio (outra aba).
         const cur = get().me;
         if (cur) {
            const has = cur.subscribedIssueIds.includes(issueId);
            if (currently && !has)
               set({ me: { ...cur, subscribedIssueIds: [...cur.subscribedIssueIds, issueId] } });
            else if (!currently && has)
               set({ me: { ...cur, subscribedIssueIds: dropId(cur.subscribedIssueIds, issueId) } });
         }
         toast.error(currently ? 'Falha ao deixar de seguir' : 'Falha ao seguir');
      });
   },

   getProjectById: (id) => get().projects.find((p) => p.id === id),
   getProjectsByTeam: (teamId) => get().projects.filter((p) => p.teamId === teamId),
   getTeamById: (id) => get().teams.find((t) => t.id === id),
   getUserById: (id) => get().users.find((u) => u.id === id),
   getInitiativeById: (id) => get().initiatives.find((i) => i.id === id),
   getInitiativeProjects: (id) => {
      const init = get().initiatives.find((i) => i.id === id);
      if (!init) return [];
      const ids = new Set(init.projectIds);
      return get().projects.filter((p) => ids.has(p.id));
   },
   countCompletedProjects: (id) => {
      const projects = get().getInitiativeProjects(id);
      const completed = projects.filter(
         (p) => p.status.category === 'completed' || p.percentComplete >= 100
      ).length;
      return { completed, total: projects.length };
   },
   getCyclesByTeam: (teamId) => get().cycles.filter((c) => c.teamId === teamId),
   getCurrentCycle: (teamId) =>
      get().cycles.find((c) => c.status === 'current' && (!teamId || c.teamId === teamId)),
   // O PRÓXIMO upcoming (menor startDate): a lista vem por número desc (Pl baixa).
   getUpcomingCycle: (teamId) =>
      get()
         .cycles.filter((c) => c.status === 'upcoming' && (!teamId || c.teamId === teamId))
         .reduce<Cycle | undefined>((a, c) => (!a || c.startDate < a.startDate ? c : a), undefined),
   getCycleById: (id) => get().cycles.find((c) => c.id === id),
   getViewById: (id) => get().views.find((v) => v.id === id),
}));
