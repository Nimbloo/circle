import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type GroupingKey = 'status' | 'assignee' | 'priority' | 'project' | 'label' | 'none';
export type OrderingKey = 'priority' | 'created' | 'title' | 'manual' | 'dueDate';
export type CompletedIssuesFilter = 'all' | 'none';

export type DisplayPropertyKey =
   | 'id'
   | 'status'
   | 'priority'
   | 'assignee'
   | 'labels'
   | 'project'
   | 'estimate'
   | 'dueDate'
   | 'created'
   | 'cycle';

export const DISPLAY_PROPERTIES: { key: DisplayPropertyKey; label: string }[] = [
   { key: 'id', label: 'ID' },
   { key: 'status', label: 'Status' },
   { key: 'assignee', label: 'Assignee' },
   { key: 'priority', label: 'Priority' },
   { key: 'project', label: 'Project' },
   { key: 'dueDate', label: 'Due date' },
   { key: 'cycle', label: 'Cycle' },
   { key: 'labels', label: 'Labels' },
   { key: 'estimate', label: 'Estimate' },
   { key: 'created', label: 'Created' },
];

const DEFAULT_DISPLAY_PROPERTIES: Record<DisplayPropertyKey, boolean> = {
   id: true,
   status: true,
   priority: true,
   assignee: true,
   labels: true,
   project: true,
   estimate: true,
   dueDate: false,
   created: true,
   cycle: false,
};

interface DisplaySettingsState {
   grouping: GroupingKey;
   ordering: OrderingKey;
   orderCompletedByRecency: boolean;
   completedIssues: CompletedIssuesFilter;
   showEmptyGroups: boolean;
   displayProperties: Record<DisplayPropertyKey, boolean>;

   setGrouping: (grouping: GroupingKey) => void;
   setOrdering: (ordering: OrderingKey) => void;
   setOrderCompletedByRecency: (value: boolean) => void;
   setCompletedIssues: (value: CompletedIssuesFilter) => void;
   setShowEmptyGroups: (value: boolean) => void;
   toggleDisplayProperty: (key: DisplayPropertyKey) => void;
   resetDisplaySettings: () => void;
}

const DEFAULTS = {
   grouping: 'status' as GroupingKey,
   ordering: 'priority' as OrderingKey,
   orderCompletedByRecency: false,
   completedIssues: 'all' as CompletedIssuesFilter,
   // "Show sub-issues" foi removido: o domínio não tem sub-issues (sem parentId), o
   // toggle não tinha consumidor. Volta junto com sub-issues (#25).
   showEmptyGroups: false,
   displayProperties: DEFAULT_DISPLAY_PROPERTIES,
};

/**
 * View display settings (Linear's "Display" popover): grouping, ordering,
 * completed-issue visibility and per-row display properties.
 * Persisted to localStorage.
 */
export const useDisplaySettingsStore = create<DisplaySettingsState>()(
   persist(
      (set) => ({
         ...DEFAULTS,

         setGrouping: (grouping) => set({ grouping }),
         setOrdering: (ordering) => set({ ordering }),
         setOrderCompletedByRecency: (orderCompletedByRecency) => set({ orderCompletedByRecency }),
         setCompletedIssues: (completedIssues) => set({ completedIssues }),
         setShowEmptyGroups: (showEmptyGroups) => set({ showEmptyGroups }),
         toggleDisplayProperty: (key) =>
            set((state) => ({
               displayProperties: {
                  ...state.displayProperties,
                  [key]: !state.displayProperties[key],
               },
            })),
         resetDisplaySettings: () => set({ ...DEFAULTS }),
      }),
      {
         name: 'display-settings',
         storage: createJSONStorage(() => localStorage),
         // Sobrepõe os defaults com o estado persistido; garante que novas
         // display properties (ex.: estimate) apareçam para usuários antigos.
         merge: (persisted, current) => {
            const p = (persisted ?? {}) as Partial<DisplaySettingsState>;
            return {
               ...current,
               ...p,
               displayProperties: {
                  ...current.displayProperties,
                  ...(p.displayProperties ?? {}),
               },
            };
         },
      }
   )
);
