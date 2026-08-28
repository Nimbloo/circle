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
import type { WorkspaceBootstrap } from '@/lib/api/workspace';
import type { MeDto } from '@/lib/api/users';
import type { ProjectDto } from '@/lib/api/projects';
import type { InitiativeDto } from '@/lib/api/initiatives';
import { useCatalogStore } from '@/store/catalog-store';
import { api } from '@/lib/client';
import { toast } from 'sonner';

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

   /** Splice de UM project/initiative a partir do DTO do servidor (após uma mutação),
    * em vez de re-hidratar o workspace inteiro — mesmo padrão do issues-store. */
   applyProject: (dto: ProjectDto) => void;
   applyInitiative: (dto: InitiativeDto) => void;
   removeProjectLocal: (id: string) => void;
   removeInitiativeLocal: (id: string) => void;

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

   hydrate: async (opts) => {
      if (get().loading) return;
      set({ loading: true });
      try {
         // Refetch de SSE passa rollover:false — não repetir a escrita do auto-rollover
         // de cycles a cada evento (só o boot genuíno da página faz o rollover).
         const qs = opts?.rollover === false ? '?rollover=0' : '';
         const res = await fetch(`/api/v1/workspace${qs}`);
         if (!res.ok) throw new Error(`workspace ${res.status}`);
         const { data } = (await res.json()) as { data: WorkspaceBootstrap };
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
      }
   },

   applyProject: (dto) => {
      const adapted = adaptProject(dto);
      set((s) => ({
         projects: s.projects.some((p) => p.id === adapted.id)
            ? s.projects.map((p) => (p.id === adapted.id ? adapted : p))
            : [...s.projects, adapted],
      }));
   },
   applyInitiative: (dto) => {
      const usersById = new Map(get().users.map((u) => [u.id, u]));
      const adapted = adaptInitiative(dto, usersById);
      set((s) => ({
         initiatives: s.initiatives.some((i) => i.id === adapted.id)
            ? s.initiatives.map((i) => (i.id === adapted.id ? adapted : i))
            : [...s.initiatives, adapted],
      }));
   },
   removeProjectLocal: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
   removeInitiativeLocal: (id) =>
      set((s) => ({ initiatives: s.initiatives.filter((i) => i.id !== id) })),

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
