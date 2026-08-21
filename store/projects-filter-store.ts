'use client';

import { parseAsArrayOf, parseAsString, useQueryStates } from 'nuqs';

export interface ProjectsFilterState {
   filters: {
      health: string[]; // health ids
      priority: string[]; // priority ids
   };

   setFilter: (type: 'health' | 'priority', ids: string[]) => void;
   toggleFilter: (type: 'health' | 'priority', id: string) => void;
   clearFilters: () => void;
   clearFilterType: (type: 'health' | 'priority') => void;

   hasActiveFilters: () => boolean;
   getActiveFiltersCount: () => number;
}

const parsers = {
   health: parseAsArrayOf(parseAsString).withDefault([]),
   priority: parseAsArrayOf(parseAsString).withDefault([]),
};

/** Projects page filters, URL-synced via nuqs (?health=…&priority=…). Sort lives in Display Options. */
export function useProjectsFilterStore(): ProjectsFilterState {
   const [state, setState] = useQueryStates(parsers, { history: 'replace' });

   const filters = { health: state.health, priority: state.priority };

   return {
      filters,

      setFilter: (type, ids) => setState({ [type]: ids.length > 0 ? ids : null }),
      toggleFilter: (type, id) => {
         const current = filters[type];
         const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
         setState({ [type]: next.length > 0 ? next : null });
      },
      clearFilters: () => setState({ health: null, priority: null }),
      clearFilterType: (type) => setState({ [type]: null }),

      hasActiveFilters: () => Object.values(filters).some((arr) => arr.length > 0),
      getActiveFiltersCount: () => Object.values(filters).reduce((sum, arr) => sum + arr.length, 0),
   };
}
