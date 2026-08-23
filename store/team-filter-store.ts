'use client';

import { Team } from '@/data/teams';
import { parseAsArrayOf, parseAsString, useQueryStates } from 'nuqs';

export interface TeamsFilterState {
   filters: {
      membership: ('Joined' | 'Not-Joined')[];
      identifier: Team['id'][];
   };

   toggleFilter: (
      type: 'membership' | 'identifier',
      id: 'Joined' | 'Not-Joined' | Team['id']
   ) => void;
   clearFilters: () => void;
   clearFilterType: (type: 'membership' | 'identifier') => void;
   hasActiveFilters: () => boolean;
   getActiveFiltersCount: () => number;
}

const parsers = {
   membership: parseAsArrayOf(parseAsString).withDefault([]),
   identifier: parseAsArrayOf(parseAsString).withDefault([]),
};

/** Teams page filters, URL-synced via nuqs (?membership=…&identifier=…). Sort lives in Display Options. */
export function useTeamsFilterStore(): TeamsFilterState {
   const [state, setState] = useQueryStates(parsers, { history: 'replace' });

   const filters = {
      membership: state.membership as ('Joined' | 'Not-Joined')[],
      identifier: state.identifier,
   };

   return {
      filters,

      toggleFilter: (type, id) => {
         const current = filters[type] as string[];
         const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
         setState({ [type]: next.length > 0 ? next : null });
      },
      clearFilters: () => setState({ membership: null, identifier: null }),
      clearFilterType: (type) => setState({ [type]: null }),

      hasActiveFilters: () => Object.values(filters).some((arr) => arr.length > 0),
      getActiveFiltersCount: () => Object.values(filters).reduce((sum, arr) => sum + arr.length, 0),
   };
}
