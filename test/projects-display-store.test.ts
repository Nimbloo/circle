import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let useProjectsDisplayStore: typeof import('@/store/projects-display-store').useProjectsDisplayStore;
let PROJECT_DISPLAY_PROPERTIES: typeof import('@/store/projects-display-store').PROJECT_DISPLAY_PROPERTIES;

beforeAll(async () => {
   const values = new Map<string, string>();
   vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
         return values.size;
      },
   });
   ({ useProjectsDisplayStore, PROJECT_DISPLAY_PROPERTIES } = await import(
      '@/store/projects-display-store'
   ));
});

afterAll(() => vi.unstubAllGlobals());

describe('projects display store', () => {
   beforeEach(() => {
      useProjectsDisplayStore.getState().resetDisplaySettings();
   });

   it('agrupa projetos por status por padrão', () => {
      expect(useProjectsDisplayStore.getState().grouping).toBe('status');
   });

   it('não altera a preferência de grupos vazios ao trocar de visualização', () => {
      useProjectsDisplayStore.getState().setShowEmptyGroups(false);

      useProjectsDisplayStore.getState().setViewType('all', 'board');

      expect(useProjectsDisplayStore.getState().showEmptyGroups).toBe(false);
   });

   it('só oferece propriedades que alguma visão desenha (sem toggles mortos)', () => {
      const keys = PROJECT_DISPLAY_PROPERTIES.map((property) => property.key);
      // milestones e members não têm dado na lista nem consumidor em list/board/timeline.
      expect(keys).not.toContain('milestones');
      expect(keys).not.toContain('members');
      expect(Object.keys(useProjectsDisplayStore.getState().displayProperties).sort()).toEqual(
         [...keys].sort()
      );
   });
});
