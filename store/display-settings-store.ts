import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useViewKey } from '@/lib/view-key';

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

const GROUPING_KEYS: readonly GroupingKey[] = [
   'status',
   'assignee',
   'priority',
   'project',
   'label',
   'none',
];
const ORDERING_KEYS: readonly OrderingKey[] = ['priority', 'created', 'title', 'manual', 'dueDate'];
const COMPLETED_FILTERS: readonly CompletedIssuesFilter[] = ['all', 'none'];

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

/** Opções do popover "Display" de UMA view (grouping, ordering, …). */
export interface ViewDisplaySettings {
   grouping: GroupingKey;
   ordering: OrderingKey;
   orderCompletedByRecency: boolean;
   completedIssues: CompletedIssuesFilter;
   showEmptyGroups: boolean;
   /** Sub-issues (#95): `false` esconde as issues com pai nas listas e no board. */
   showSubIssues: boolean;
   displayProperties: Record<DisplayPropertyKey, boolean>;
}

export const DEFAULT_DISPLAY_SETTINGS: ViewDisplaySettings = {
   grouping: 'status',
   ordering: 'priority',
   orderCompletedByRecency: false,
   completedIssues: 'all',
   showEmptyGroups: false,
   showSubIssues: true,
   displayProperties: DEFAULT_DISPLAY_PROPERTIES,
};

interface DisplaySettingsState {
   /** Opções por view (chave de `lib/view-key.ts`). View ausente = defaults. */
   byView: Record<string, ViewDisplaySettings>;

   setGrouping: (viewKey: string, grouping: GroupingKey) => void;
   setOrdering: (viewKey: string, ordering: OrderingKey) => void;
   setOrderCompletedByRecency: (viewKey: string, value: boolean) => void;
   setCompletedIssues: (viewKey: string, value: CompletedIssuesFilter) => void;
   setShowEmptyGroups: (viewKey: string, value: boolean) => void;
   setShowSubIssues: (viewKey: string, value: boolean) => void;
   toggleDisplayProperty: (viewKey: string, key: DisplayPropertyKey) => void;
   /** Volta SÓ a view indicada aos defaults (as outras views não mudam). */
   resetDisplaySettings: (viewKey: string) => void;
   /** Aplica o snapshot do servidor (user-settings-sync): substitui o mapa inteiro. */
   hydrateByView: (byView: Record<string, Partial<ViewDisplaySettings>>) => void;
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
   return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/**
 * Completa um parcial (localStorage antigo, servidor) com os defaults — garante que
 * novas display properties (ex.: estimate) apareçam para quem já tinha a view salva
 * e descarta valores fora do domínio.
 */
export function normalizeDisplaySettings(
   partial: Partial<ViewDisplaySettings> | undefined | null
): ViewDisplaySettings {
   const p = partial && typeof partial === 'object' ? partial : {};
   const properties: Record<DisplayPropertyKey, boolean> = { ...DEFAULT_DISPLAY_PROPERTIES };
   const incoming = (p.displayProperties ?? {}) as Partial<Record<DisplayPropertyKey, unknown>>;
   (Object.keys(DEFAULT_DISPLAY_PROPERTIES) as DisplayPropertyKey[]).forEach((key) => {
      if (typeof incoming[key] === 'boolean') properties[key] = incoming[key] as boolean;
   });
   return {
      grouping: isOneOf(GROUPING_KEYS, p.grouping) ? p.grouping : DEFAULT_DISPLAY_SETTINGS.grouping,
      ordering: isOneOf(ORDERING_KEYS, p.ordering) ? p.ordering : DEFAULT_DISPLAY_SETTINGS.ordering,
      orderCompletedByRecency:
         typeof p.orderCompletedByRecency === 'boolean'
            ? p.orderCompletedByRecency
            : DEFAULT_DISPLAY_SETTINGS.orderCompletedByRecency,
      completedIssues: isOneOf(COMPLETED_FILTERS, p.completedIssues)
         ? p.completedIssues
         : DEFAULT_DISPLAY_SETTINGS.completedIssues,
      showEmptyGroups:
         typeof p.showEmptyGroups === 'boolean'
            ? p.showEmptyGroups
            : DEFAULT_DISPLAY_SETTINGS.showEmptyGroups,
      showSubIssues:
         typeof p.showSubIssues === 'boolean'
            ? p.showSubIssues
            : DEFAULT_DISPLAY_SETTINGS.showSubIssues,
      displayProperties: properties,
   };
}

function normalizeByView(
   byView: Record<string, Partial<ViewDisplaySettings>> | undefined | null
): Record<string, ViewDisplaySettings> {
   const result: Record<string, ViewDisplaySettings> = {};
   if (!byView || typeof byView !== 'object') return result;
   for (const [viewKey, settings] of Object.entries(byView)) {
      result[viewKey] = normalizeDisplaySettings(settings);
   }
   return result;
}

/** As opções de uma view (defaults quando nunca foi customizada). */
export function getViewDisplaySettings(
   byView: Record<string, ViewDisplaySettings>,
   viewKey: string
): ViewDisplaySettings {
   return byView[viewKey] ?? DEFAULT_DISPLAY_SETTINGS;
}

/** True quando a view está exatamente nos defaults (inclui display properties). */
export function isDefaultDisplaySettings(settings: ViewDisplaySettings): boolean {
   return (
      settings.grouping === DEFAULT_DISPLAY_SETTINGS.grouping &&
      settings.ordering === DEFAULT_DISPLAY_SETTINGS.ordering &&
      settings.orderCompletedByRecency === DEFAULT_DISPLAY_SETTINGS.orderCompletedByRecency &&
      settings.completedIssues === DEFAULT_DISPLAY_SETTINGS.completedIssues &&
      settings.showEmptyGroups === DEFAULT_DISPLAY_SETTINGS.showEmptyGroups &&
      settings.showSubIssues === DEFAULT_DISPLAY_SETTINGS.showSubIssues &&
      (Object.keys(DEFAULT_DISPLAY_PROPERTIES) as DisplayPropertyKey[]).every(
         (key) => settings.displayProperties[key] === DEFAULT_DISPLAY_PROPERTIES[key]
      )
   );
}

/**
 * View display settings (Linear's "Display" popover), POR VIEW: cada rota lembra o
 * próprio grouping/ordering/etc. Persistido em localStorage e sincronizado com o
 * servidor via user-settings-sync. Componentes NÃO leem este store direto — usam
 * `useDisplaySettings()` / `useDisplaySetting(key)`, já ligados à view atual.
 */
export const useDisplaySettingsStore = create<DisplaySettingsState>()(
   persist(
      (set) => {
         const patchView = (viewKey: string, patch: Partial<ViewDisplaySettings>) =>
            set((state) => ({
               byView: {
                  ...state.byView,
                  [viewKey]: { ...getViewDisplaySettings(state.byView, viewKey), ...patch },
               },
            }));
         return {
            byView: {},

            setGrouping: (viewKey, grouping) => patchView(viewKey, { grouping }),
            setOrdering: (viewKey, ordering) => patchView(viewKey, { ordering }),
            setOrderCompletedByRecency: (viewKey, orderCompletedByRecency) =>
               patchView(viewKey, { orderCompletedByRecency }),
            setCompletedIssues: (viewKey, completedIssues) =>
               patchView(viewKey, { completedIssues }),
            setShowEmptyGroups: (viewKey, showEmptyGroups) =>
               patchView(viewKey, { showEmptyGroups }),
            setShowSubIssues: (viewKey, showSubIssues) => patchView(viewKey, { showSubIssues }),
            toggleDisplayProperty: (viewKey, key) =>
               set((state) => {
                  const current = getViewDisplaySettings(state.byView, viewKey);
                  return {
                     byView: {
                        ...state.byView,
                        [viewKey]: {
                           ...current,
                           displayProperties: {
                              ...current.displayProperties,
                              [key]: !current.displayProperties[key],
                           },
                        },
                     },
                  };
               }),
            resetDisplaySettings: (viewKey) =>
               set((state) => {
                  if (!(viewKey in state.byView)) return state;
                  const byView = { ...state.byView };
                  delete byView[viewKey];
                  return { byView };
               }),
            hydrateByView: (byView) => set({ byView: normalizeByView(byView) }),
         };
      },
      {
         name: 'display-settings',
         storage: createJSONStorage(() => localStorage),
         partialize: ({ byView }) => ({ byView }),
         version: 1,
         // v0 era um estado flat global (grouping, ordering, … na raiz): descartado —
         // sem mapeamento honesto para "qual view", e o default é o do Linear.
         migrate: (persisted, version) => {
            if (version < 1) return { byView: {} };
            return persisted as Partial<DisplaySettingsState>;
         },
         // Sobrepõe os defaults com o persistido, view a view, completando novas
         // display properties (ex.: estimate) para quem já tinha a view salva.
         merge: (persisted, current) => {
            const p = (persisted ?? {}) as Partial<DisplaySettingsState>;
            return { ...current, byView: normalizeByView(p.byView) };
         },
      }
   )
);

type DisplaySettingsActions = {
   setGrouping: (grouping: GroupingKey) => void;
   setOrdering: (ordering: OrderingKey) => void;
   setOrderCompletedByRecency: (value: boolean) => void;
   setCompletedIssues: (value: CompletedIssuesFilter) => void;
   setShowEmptyGroups: (value: boolean) => void;
   setShowSubIssues: (value: boolean) => void;
   toggleDisplayProperty: (key: DisplayPropertyKey) => void;
   resetDisplaySettings: () => void;
};

export type DisplaySettings = ViewDisplaySettings & DisplaySettingsActions;

/**
 * Uma opção de display da view atual. Selector estreito: o componente só re-renderiza
 * quando ESSA chave muda (ex.: `issue-line` assina só `displayProperties`).
 */
export function useDisplaySetting<K extends keyof ViewDisplaySettings>(
   key: K
): ViewDisplaySettings[K] {
   const viewKey = useViewKey();
   return useDisplaySettingsStore((s) => getViewDisplaySettings(s.byView, viewKey)[key]);
}

/**
 * Opções + setters da view atual — o mesmo shape que o store flat devolvia, mas
 * escopado pela chave de view (`useViewKey`). Para assinar uma chave só, prefira
 * `useDisplaySetting(key)`.
 */
export function useDisplaySettings(): DisplaySettings {
   const viewKey = useViewKey();
   const settings = useDisplaySettingsStore((s) => getViewDisplaySettings(s.byView, viewKey));
   const actions = useMemo<DisplaySettingsActions>(() => {
      const store = useDisplaySettingsStore.getState();
      return {
         setGrouping: (grouping) => store.setGrouping(viewKey, grouping),
         setOrdering: (ordering) => store.setOrdering(viewKey, ordering),
         setOrderCompletedByRecency: (value) => store.setOrderCompletedByRecency(viewKey, value),
         setCompletedIssues: (value) => store.setCompletedIssues(viewKey, value),
         setShowEmptyGroups: (value) => store.setShowEmptyGroups(viewKey, value),
         setShowSubIssues: (value) => store.setShowSubIssues(viewKey, value),
         toggleDisplayProperty: (key) => store.toggleDisplayProperty(viewKey, key),
         resetDisplaySettings: () => store.resetDisplaySettings(viewKey),
      };
   }, [viewKey]);
   return useMemo(() => ({ ...settings, ...actions }), [settings, actions]);
}
