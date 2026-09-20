import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDto } from '@/lib/api/projects';

const api = vi.hoisted(() => ({
   workspace: vi.fn(),
   projects: { update: vi.fn() },
   issues: { subscribe: vi.fn(), unsubscribe: vi.fn() },
}));
vi.mock('@/lib/client', () => ({ api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { useWorkspaceStore } = await import('@/store/workspace-store');

const status = { id: 'proj-started', name: 'Started', color: '#fff', category: 'started' };
const priority = { id: 'high', name: 'High' };
const health = { id: 'on-track', name: 'On track', color: '#0f0', description: null };

function projectDto(id: string, extra: Partial<ProjectDto> = {}): ProjectDto {
   return {
      id,
      name: `Project ${id}`,
      status,
      percentComplete: 0,
      startDate: null,
      targetDate: null,
      lead: null,
      priority,
      health,
      teamId: 'ENG',
      labels: [],
      initiativeId: null,
      healthUpdatedAgoDays: null,
      issueCount: 0,
      ...extra,
   } as unknown as ProjectDto;
}

function bootstrap(projects: ProjectDto[], subscribed: string[] = []) {
   return {
      me: { id: 'me', subscribedIssueIds: subscribed, teamIds: [] },
      statuses: [],
      projectStatuses: [status],
      priorities: [priority],
      labels: [],
      healthStates: [health],
      members: [],
      projects,
      teams: [],
      cycles: [],
      initiatives: [],
      views: [],
   };
}

function deferred<T>() {
   let resolve!: (v: T) => void;
   let reject!: (e: unknown) => void;
   const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
   });
   return { promise, resolve, reject };
}

const st = () => useWorkspaceStore.getState();

beforeEach(() => {
   vi.clearAllMocks();
});

describe('workspace.hydrate preserva referências (If#15)', () => {
   it('item sem mudança mantém a referência; o alterado troca', async () => {
      api.workspace.mockResolvedValueOnce(bootstrap([projectDto('p1'), projectDto('p2')]));
      await st().hydrate();
      const before = st().projects;
      api.workspace.mockResolvedValueOnce(
         bootstrap([projectDto('p1'), projectDto('p2', { name: 'Renomeado' })])
      );
      await st().hydrate();
      const after = st().projects;
      expect(after[0]).toBe(before[0]);
      expect(after[1]).not.toBe(before[1]);
      expect(after[1].name).toBe('Renomeado');
   });

   it('nada mudou: a lista inteira mantém a referência (sem re-render)', async () => {
      api.workspace.mockResolvedValueOnce(bootstrap([projectDto('p1')]));
      await st().hydrate();
      const before = st().projects;
      api.workspace.mockResolvedValueOnce(bootstrap([projectDto('p1')]));
      await st().hydrate();
      expect(st().projects).toBe(before);
   });

   it('apply* que chegou durante o bootstrap vence o snapshot (mais velho)', async () => {
      api.workspace.mockResolvedValueOnce(bootstrap([projectDto('p1')]));
      await st().hydrate();
      const pending = deferred<unknown>();
      api.workspace.mockReturnValueOnce(pending.promise);
      const h = st().hydrate();
      st().applyProject(projectDto('p1', { name: 'Novo via SSE' }));
      pending.resolve(bootstrap([projectDto('p1', { name: 'Snapshot velho' })]));
      await h;
      expect(st().projects[0].name).toBe('Novo via SSE');
   });
});

describe('rollback por campo/id (#17)', () => {
   it('patchProject: falha desfaz só o campo ainda otimista; mudança remota fica', async () => {
      api.workspace.mockResolvedValueOnce(bootstrap([projectDto('p1')]));
      await st().hydrate();
      const req = deferred<ProjectDto>();
      api.projects.update.mockReturnValueOnce(req.promise);
      const p = st().patchProject('p1', { name: 'Otimista', targetDate: '2026-12-01' }, {});
      // Evento remoto no meio: outro usuário mudou a data.
      st().applyProject(projectDto('p1', { targetDate: '2027-01-01' } as never));
      req.reject(new Error('500'));
      await expect(p).rejects.toThrow('500');
      expect(st().projects[0].name).toBe('Project p1');
      expect(st().projects[0].targetDate).toBe('2027-01-01');
   });

   it('toggleSubscription: rollback só da issue alternada', async () => {
      api.workspace.mockResolvedValueOnce(bootstrap([], ['i0']));
      await st().hydrate();
      const req = deferred<unknown>();
      api.issues.subscribe.mockReturnValueOnce(req.promise);
      st().toggleSubscription('i1');
      // Outra aba seguiu i2 no meio (applyMe com a lista nova).
      st().applyMe({ ...st().me!, subscribedIssueIds: ['i0', 'i1', 'i2'] });
      req.reject(new Error('500'));
      await vi.waitFor(() => expect(st().me?.subscribedIssueIds).toEqual(['i0', 'i2']));
   });
});
