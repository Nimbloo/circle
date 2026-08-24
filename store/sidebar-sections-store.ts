import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Estado aberto/fechado das SEÇÕES da sidebar (Workspace, Your teams…), estilo Linear —
 * o label da seção colapsa/expande seus itens. Persistido por-usuário (localStorage).
 */
interface SidebarSectionsState {
   collapsed: Record<string, boolean>;
   toggle: (key: string) => void;
}

export const useSidebarSectionsStore = create<SidebarSectionsState>()(
   persist(
      (set) => ({
         collapsed: {},
         toggle: (key) =>
            set((s) => ({ collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } })),
      }),
      { name: 'sidebar-sections' }
   )
);
