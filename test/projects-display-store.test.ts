import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let useProjectsDisplayStore: typeof import('@/store/projects-display-store').useProjectsDisplayStore;

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
   ({ useProjectsDisplayStore } = await import('@/store/projects-display-store'));
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
});
