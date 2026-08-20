import { create } from 'zustand';
import { ProjectUpdate, ProjectUpdateHealth } from '@/mock-data/project-details';
import type { User } from '@/mock-data/users';
import { useWorkspaceStore } from '@/store/workspace-store';

/** Autor da update = usuário corrente (SSO); do workspace store, com fallback mínimo. */
function currentAuthor(): User {
   const ws = useWorkspaceStore.getState();
   const me = ws.me;
   const full = me ? ws.getUserById(me.id) : undefined;
   if (full) return full;
   if (me) {
      return {
         id: me.id,
         name: me.name,
         email: me.email,
         avatarUrl: me.avatarUrl ?? '',
         status: 'online',
         role: me.role as User['role'],
         joinedDate: new Date().toISOString().slice(0, 10),
         teamIds: me.teamIds,
         timezone: 'UTC',
      };
   }
   return {
      id: 'me',
      name: 'You',
      email: '',
      avatarUrl: '',
      status: 'online',
      role: 'Member',
      joinedDate: new Date().toISOString().slice(0, 10),
      teamIds: [],
      timezone: 'UTC',
   };
}

interface ProjectUpdatesState {
   /** Updates posted at runtime, newest first, keyed by project id. */
   postedUpdates: Record<string, ProjectUpdate[]>;
   postUpdate: (projectId: string, health: ProjectUpdateHealth, text: string) => void;
}

let nextId = 1;

/**
 * Runtime project updates (the "Post update" composer). Merged with the
 * mock updates from project-details.ts when rendering the Activity tab.
 */
export const useProjectUpdatesStore = create<ProjectUpdatesState>((set) => ({
   postedUpdates: {},
   postUpdate: (projectId, health, text) =>
      set((state) => {
         const update: ProjectUpdate = {
            id: `posted-${nextId++}`,
            author: currentAuthor(),
            date: new Date().toISOString().slice(0, 10),
            health,
            blocks: text
               .split(/\n{2,}/)
               .filter((paragraph) => paragraph.trim() !== '')
               .map((paragraph) => ({ type: 'paragraph', text: paragraph.trim() })),
         };
         return {
            postedUpdates: {
               ...state.postedUpdates,
               [projectId]: [update, ...(state.postedUpdates[projectId] ?? [])],
            },
         };
      }),
}));
