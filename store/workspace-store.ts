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
import type { WorkspaceBootstrap, TeamFull } from '@/lib/api/workspace';
import type { MeDto } from '@/lib/api/users';
import type { ProjectDto } from '@/lib/api/projects';
import type { InitiativeDto } from '@/lib/api/initiatives';
import type { TeamDto } from '@/lib/api/teams';
import type { MemberDto } from '@/lib/api/members';
import type { CycleDto } from '@/lib/api/cycles';
import type { ViewDto } from '@/lib/api/views';
import { useCatalogStore } from '@/store/catalog-store';
import { api } from '@/lib/client';
import { toast } from 'sonner';

/** Team das rotas de escrita (TeamDto, sem members/projects) ou do bootstrap (TeamFull). */
export type TeamLike = TeamDto & Partial<Pick<TeamFull, 'members' | 'projects'>>;

interface WorkspaceState {
   loaded: boolean;
   loading: boolean;
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
    * também mantém as CÓPIAS derivadas coerentes (`teams[].projects`,
    * `initiatives[].projectIds`, `projects[].initiative`, membership em `teams[].members`,
    * `owner` de initiatives/views), sem tocar nas demais coleções. */
   applyProject: (dto: ProjectDto) => void;
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
         try {
            // Só o boot da página pede rollover (escrita); refetches ficam na leitura.
            const data = await api.workspace({ rollover: opts?.rollover });
            // Catálogos (status/priority/label/health) já vêm no bootstrap — populamos
            // o catalog-store a partir daqui, sem fetch duplicado.
            useCatalogStore.getState().setCatalogs(data);
            const users = data.members.map(adaptMemberToUser);
            const usersById = new Map(users.map((u) => [u.id, u]));
            set({
               me: data.me,
               projects: data.projects.map(adaptProject),
               teams: data.teams.map(adaptTeam),
               users,
               cycles: data.cycles.map(adaptCycle),
               initiatives: data.initiatives.map((i) => adaptInitiative(i, usersById)),
               views: data.views.map((v) => adaptView(v, usersById)),
               loaded: true,
               loading: false,
            });
         } catch {
            set({ loading: false });
         } finally {
            inFlight = null;
         }
      })();
      return inFlight;
   },

   applyProject: (dto) => {
      const adapted = adaptProject(dto);
      set((s) => ({
         projects: upsert(s.projects, adapted),
         // `teams[].projects` só alimenta contagens: mantém a PERTINÊNCIA (entra no time
         // do DTO, sai dos outros) sem trocar o objeto a cada edição, o que re-renderizaria
         // todo assinante de `teams` à toa.
         teams: mapIfChanged(s.teams, (t) => {
            const has = t.projects.some((p) => p.id === adapted.id);
            if (t.id === adapted.teamId)
               return has ? t : { ...t, projects: [...t.projects, adapted] };
            return has ? { ...t, projects: t.projects.filter((p) => p.id !== adapted.id) } : t;
         }),
         // Vínculo relacional: o projeto entra no `projectIds` da initiative nova e sai da antiga.
         initiatives: mapIfChanged(s.initiatives, (i) => {
            const linked = i.projectIds.includes(adapted.id);
            if (i.id === dto.initiativeId)
               return linked ? i : { ...i, projectIds: [...i.projectIds, adapted.id] };
            return linked ? { ...i, projectIds: dropId(i.projectIds, adapted.id) } : i;
         }),
      }));
   },
   applyInitiative: (dto) => {
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
   removeProjectLocal: (id) =>
      set((s) => ({
         projects: s.projects.filter((p) => p.id !== id),
         teams: mapIfChanged(s.teams, (t) =>
            t.projects.some((p) => p.id === id)
               ? { ...t, projects: t.projects.filter((p) => p.id !== id) }
               : t
         ),
         initiatives: mapIfChanged(s.initiatives, (i) =>
            i.projectIds.includes(id) ? { ...i, projectIds: dropId(i.projectIds, id) } : i
         ),
      })),
   removeInitiativeLocal: (id) =>
      set((s) => ({
         initiatives: s.initiatives.filter((i) => i.id !== id),
         projects: mapIfChanged(s.projects, (p) =>
            p.initiative === id ? { ...p, initiative: undefined } : p
         ),
      })),

   applyTeam: (dto) =>
      set((s) => {
         const prev = s.teams.find((t) => t.id === dto.id);
         const adapted = adaptTeam({
            ...dto,
            members: dto.members ?? [],
            projects: dto.projects ?? [],
         });
         // Rotas de escrita devolvem TeamDto sem members/projects: preserva as cópias do store.
         if (!dto.members) adapted.members = prev?.members ?? [];
         if (!dto.projects)
            adapted.projects = prev?.projects ?? s.projects.filter((p) => p.teamId === dto.id);
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
      }),
   removeTeamLocal: (id) =>
      set((s) => ({
         teams: s.teams.filter((t) => t.id !== id),
         users: mapIfChanged(s.users, (u) =>
            u.teamIds.includes(id) ? { ...u, teamIds: dropId(u.teamIds, id) } : u
         ),
         me: s.me?.teamIds.includes(id) ? { ...s.me, teamIds: dropId(s.me.teamIds, id) } : s.me,
      })),
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

   applyCycle: (dto) => set((s) => ({ cycles: upsert(s.cycles, adaptCycle(dto)) })),
   removeCycleLocal: (id) => set((s) => ({ cycles: s.cycles.filter((c) => c.id !== id) })),

   applyView: (dto) =>
      set((s) => {
         const usersById = new Map(s.users.map((u) => [u.id, u]));
         return { views: upsert(s.views, adaptView(dto, usersById)) };
      }),
   removeViewLocal: (id) => set((s) => ({ views: s.views.filter((v) => v.id !== id) })),

   applyUser: (dto) =>
      set((s) => {
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
         // Rollback: restaura a lista anterior deste usuário.
         const cur = get().me;
         if (cur) set({ me: { ...cur, subscribedIssueIds: me.subscribedIssueIds } });
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
   getUpcomingCycle: (teamId) =>
      get().cycles.find((c) => c.status === 'upcoming' && (!teamId || c.teamId === teamId)),
   getCycleById: (id) => get().cycles.find((c) => c.id === id),
   getViewById: (id) => get().views.find((v) => v.id === id),
}));
