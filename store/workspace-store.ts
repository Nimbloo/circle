import { create } from 'zustand';
import { Project } from '@/mock-data/projects';
import { Team } from '@/mock-data/teams';
import { User } from '@/mock-data/users';
import { Cycle } from '@/mock-data/cycles';
import { Initiative } from '@/mock-data/initiatives';
import { View } from '@/mock-data/views';
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

   hydrate: () => Promise<void>;

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

   hydrate: async () => {
      if (get().loading) return;
      set({ loading: true });
      try {
         const res = await fetch('/api/v1/workspace');
         if (!res.ok) throw new Error(`workspace ${res.status}`);
         const { data } = (await res.json()) as { data: WorkspaceBootstrap };
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
