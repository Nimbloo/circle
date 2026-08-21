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
   /**
    * Updates OTIMISTAS (recém-postadas), newest first, por project id. Servem só
    * de buffer entre o POST e o re-fetch do detalhe: `postUpdate` insere o item
    * na hora e `removeUpdate` o remove quando o servidor confirma (o update
    * persistido volta em `detail.updates`) ou quando o POST falha (rollback).
    */
   postedUpdates: Record<string, ProjectUpdate[]>;
   /** Insere um update otimista e o RETORNA (id + blocks) p/ enviar ao backend. */
   postUpdate: (projectId: string, health: ProjectUpdateHealth, text: string) => ProjectUpdate;
   /** Remove um update otimista (confirmação pós-persistência ou rollback de erro). */
   removeUpdate: (projectId: string, id: string) => void;
}

let nextId = 1;

/**
 * Runtime project updates (the "Post update" composer). Buffer otimista mesclado
 * com `detail.updates` (backend) ao renderizar a aba Activity.
 */
export const useProjectUpdatesStore = create<ProjectUpdatesState>((set) => ({
   postedUpdates: {},
   postUpdate: (projectId, health, text) => {
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
      set((state) => ({
         postedUpdates: {
            ...state.postedUpdates,
            [projectId]: [update, ...(state.postedUpdates[projectId] ?? [])],
         },
      }));
      return update;
   },
   removeUpdate: (projectId, id) =>
      set((state) => ({
         postedUpdates: {
            ...state.postedUpdates,
            [projectId]: (state.postedUpdates[projectId] ?? []).filter((u) => u.id !== id),
         },
      })),
}));
