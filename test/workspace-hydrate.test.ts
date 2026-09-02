import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceCalls: { rollover?: boolean }[] = [];
let release: (() => void) | null = null;

vi.mock('@/lib/client', () => ({
   api: {
      workspace: (opts?: { rollover?: boolean }) => {
         workspaceCalls.push(opts ?? {});
         return new Promise((resolve) => {
            release = () =>
               resolve({
                  me: { id: 'me', admin: false },
                  statuses: [],
                  priorities: [],
                  labels: [],
                  healths: [],
                  members: [],
                  projects: [],
                  teams: [],
                  cycles: [],
                  initiatives: [],
                  views: [],
               });
         });
      },
   },
}));
vi.mock('@/store/catalog-store', () => ({
   useCatalogStore: { getState: () => ({ setCatalogs: () => {} }) },
}));

const { useWorkspaceStore } = await import('@/store/workspace-store');

describe('workspace-store.hydrate', () => {
   beforeEach(() => {
      workspaceCalls.length = 0;
      release = null;
   });

   it('coalesce: chamadas durante um fetch em voo rodam UMA vez depois, não são descartadas', async () => {
      const store = useWorkspaceStore.getState();
      const first = store.hydrate({ rollover: true });
      const second = store.hydrate();
      const third = store.hydrate();
      expect(workspaceCalls).toHaveLength(1); // só o primeiro fetch foi disparado
      release!();
      await first;
      // O segundo/terceiro viraram um único refetch, disparado depois do primeiro.
      await vi.waitFor(() => expect(workspaceCalls).toHaveLength(2));
      release!();
      await Promise.all([second, third]);
      expect(workspaceCalls).toHaveLength(2);
      expect(useWorkspaceStore.getState().loaded).toBe(true);
      expect(useWorkspaceStore.getState().loading).toBe(false);
   });

   it('só o boot pede rollover; o refetch coalescido vai sem', async () => {
      const store = useWorkspaceStore.getState();
      const boot = store.hydrate({ rollover: true });
      const refetch = store.hydrate();
      release!();
      await boot;
      await vi.waitFor(() => expect(workspaceCalls).toHaveLength(2));
      release!();
      await refetch;
      expect(workspaceCalls[0]).toEqual({ rollover: true });
      expect(workspaceCalls[1]).toEqual({});
   });
});
