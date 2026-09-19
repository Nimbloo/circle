import { beforeEach, describe, expect, it, vi } from 'vitest';
import { status } from './helpers/catalog-fixture';
import { adaptIssue } from '@/lib/adapters';
import type { IssueDto } from '@/lib/api/issues';

const apiMocks = vi.hoisted(() => ({
   list: vi.fn(),
   get: vi.fn(),
   changes: vi.fn(),
   update: vi.fn(),
   addLabel: vi.fn(),
   removeLabel: vi.fn(),
   reorder: vi.fn(),
}));
vi.mock('@/lib/client', () => {
   class ApiError extends Error {
      constructor(
         public status: number,
         message: string
      ) {
         super(message);
      }
   }
   return { api: { issues: apiMocks }, ApiError };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { useIssuesStore } = await import('@/store/issues-store');
const { ApiError } = await import('@/lib/client');
const { getClientId, isOwnEcho } = await import('@/lib/client-id');

const dto = (over: Partial<IssueDto> & { id: string }): IssueDto =>
   ({
      identifier: `ENG-${over.id}`,
      teamId: 'ENG',
      title: `Issue ${over.id}`,
      status: {
         id: status[0].id,
         name: status[0].name,
         color: status[0].color,
         category: 'started',
      },
      priority: { id: 'no-priority', name: 'No priority' },
      assignee: null,
      assignees: [],
      createdBy: null,
      project: null,
      cycleId: '',
      labels: [],
      rank: `0|a${over.id}`,
      dueDate: null,
      estimate: null,
      subIssueCount: 0,
      subIssueDoneCount: 0,
      snoozedUntil: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...over,
   }) as unknown as IssueDto;
const issue = (over: Partial<IssueDto> & { id: string }) => adaptIssue(dto(over));

function deferred<T>() {
   let resolve!: (v: T) => void;
   let reject!: (e: unknown) => void;
   const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
   });
   return { promise, resolve, reject };
}

const st = () => useIssuesStore.getState();

beforeEach(() => {
   vi.clearAllMocks();
   useIssuesStore.setState({ issues: [], loaded: true, loading: false, error: false });
});

describe('mutação própria usa o DTO da resposta (If#16)', () => {
   it('updateIssue aplica o DTO devolvido pelo PATCH, sem GET — mesmo fora do store', async () => {
      apiMocks.update.mockResolvedValueOnce(
         dto({ id: 'a', title: 'Novo', updatedAt: '2026-05-01T00:00:00.000Z' })
      );
      await st().updateIssue('a', { title: 'Novo' });
      expect(apiMocks.get).not.toHaveBeenCalled();
      expect(st().getIssueById('a')?.title).toBe('Novo');
      expect(st().getIssueById('a')?.updatedAt).toBe('2026-05-01T00:00:00.000Z');
   });

   it('marca a mutação: o eco SSE desta aba para a issue é reconhecido', async () => {
      useIssuesStore.setState({ issues: [issue({ id: 'a' })] });
      apiMocks.update.mockResolvedValueOnce(dto({ id: 'a', title: 'x' }));
      await st().updateIssue('a', { title: 'x' });
      expect(isOwnEcho({ entity: 'issue', id: 'a', clientId: getClientId() })).toBe(true);
      expect(isOwnEcho({ entity: 'issue', id: 'a', clientId: 'outra-aba-123' })).toBe(false);
      expect(isOwnEcho({ entity: 'issue', id: 'b', clientId: getClientId() })).toBe(false);
   });

   it('duas edições em voo: a resposta da 1ª não pisa no otimista da 2ª', async () => {
      useIssuesStore.setState({ issues: [issue({ id: 'a' })] });
      const first = deferred<IssueDto>();
      const second = deferred<IssueDto>();
      apiMocks.update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const p1 = st().updateIssue('a', { title: 'um' });
      const p2 = st().updateIssue('a', { title: 'dois' });
      first.resolve(dto({ id: 'a', title: 'um', updatedAt: '2026-05-01T00:00:00.000Z' }));
      await p1;
      expect(st().getIssueById('a')?.title).toBe('dois');
      second.resolve(dto({ id: 'a', title: 'dois', updatedAt: '2026-05-02T00:00:00.000Z' }));
      await p2;
      expect(st().getIssueById('a')?.title).toBe('dois');
      expect(st().getIssueById('a')?.updatedAt).toBe('2026-05-02T00:00:00.000Z');
   });

   it('labels: add/remove aplicam o DTO da resposta', async () => {
      useIssuesStore.setState({ issues: [issue({ id: 'a' })] });
      const bug = { id: 'bug', name: 'Bug', color: 'red' };
      apiMocks.addLabel.mockResolvedValueOnce(
         dto({ id: 'a', labels: [bug] as never, updatedAt: '2026-05-01T00:00:00.000Z' })
      );
      await st().addIssueLabel('a', bug);
      expect(st().getIssueById('a')?.updatedAt).toBe('2026-05-01T00:00:00.000Z');
      expect(apiMocks.get).not.toHaveBeenCalled();
   });
});

describe('rollback só se o valor ainda é o otimista (#17)', () => {
   it('falha do PATCH não desfaz mudança remota que chegou no meio', async () => {
      useIssuesStore.setState({ issues: [issue({ id: 'a' })] });
      const req = deferred<IssueDto>();
      apiMocks.update.mockReturnValueOnce(req.promise);
      const p = st().updateIssue('a', { title: 'otimista' });
      st().applyDto(dto({ id: 'a', title: 'remoto', updatedAt: '2026-06-01T00:00:00.000Z' }));
      req.reject(new Error('500'));
      await expect(p).rejects.toThrow('500');
      expect(st().getIssueById('a')?.title).toBe('remoto');
   });

   it('falha do PATCH desfaz quando nada mudou no meio', async () => {
      useIssuesStore.setState({ issues: [issue({ id: 'a' })] });
      apiMocks.update.mockRejectedValueOnce(new Error('500'));
      await expect(st().updateIssue('a', { title: 'otimista' })).rejects.toThrow('500');
      expect(st().getIssueById('a')?.title).toBe('Issue a');
   });

   it('reorder: rollback só se o rank ainda é o otimista', async () => {
      useIssuesStore.setState({
         issues: [issue({ id: 'a', rank: '0|a' }), issue({ id: 'b', rank: '0|c' })],
      });
      const req = deferred<IssueDto>();
      apiMocks.reorder.mockReturnValueOnce(req.promise);
      st().reorderIssue('b', null, 'a');
      st().applyDto(dto({ id: 'b', rank: '0|z', updatedAt: '2026-06-01T00:00:00.000Z' }));
      req.reject(new Error('500'));
      await vi.waitFor(() => expect(st().getIssueById('b')?.rank).toBe('0|z'));
   });
});

describe('applyRemote: 404 remove; erro transitório tenta uma vez de novo (If#23)', () => {
   it('404 remove a issue do store sem hidratar tudo', async () => {
      const hydrate = vi.spyOn(st(), 'hydrate');
      useIssuesStore.setState({ issues: [issue({ id: 'a' }), issue({ id: 'b' })] });
      apiMocks.get.mockRejectedValueOnce(new ApiError(404, 'não encontrada'));
      await st().applyRemote('a');
      expect(st().issues.map((i) => i.id)).toEqual(['b']);
      expect(hydrate).not.toHaveBeenCalled();
      expect(apiMocks.list).not.toHaveBeenCalled();
   });

   it('erro transitório: uma nova tentativa; se passar, aplica', async () => {
      apiMocks.get
         .mockRejectedValueOnce(new ApiError(503, 'x'))
         .mockResolvedValueOnce(dto({ id: 'a', title: 'ok' }));
      await st().applyRemote('a');
      expect(apiMocks.get).toHaveBeenCalledTimes(2);
      expect(st().getIssueById('a')?.title).toBe('ok');
   });

   it('duas falhas: mantém o store e não hidrata tudo', async () => {
      useIssuesStore.setState({ issues: [issue({ id: 'a' })] });
      apiMocks.get.mockRejectedValue(new ApiError(503, 'x'));
      await st().applyRemote('a');
      expect(apiMocks.get).toHaveBeenCalledTimes(2);
      expect(st().issues.map((i) => i.id)).toEqual(['a']);
      expect(apiMocks.list).not.toHaveBeenCalled();
   });
});

describe('resync incremental (#14)', () => {
   it('pede o delta desde a marca d’água, aplica mudanças e remove as lápides', async () => {
      const a = issue({ id: 'a', updatedAt: '2026-03-01T10:00:00.000Z' });
      useIssuesStore.setState({
         issues: [a, issue({ id: 'b' }), issue({ id: 'c', updatedAt: '2026-03-01T12:00:00.000Z' })],
      });
      apiMocks.changes.mockResolvedValueOnce({
         data: [dto({ id: 'b', title: 'B2', updatedAt: '2026-03-02T00:00:00.000Z' })],
         meta: { ids: ['a', 'b'], truncated: false },
      });
      await st().resync();
      const since = new Date(apiMocks.changes.mock.calls[0][0] as string).getTime();
      // Margem de segurança antes da maior `updatedAt` do store (relógios de pods).
      expect(since).toBeLessThan(new Date('2026-03-01T12:00:00.000Z').getTime());
      expect(st().issues.map((i) => i.id)).toEqual(['a', 'b']);
      expect(st().getIssueById('b')?.title).toBe('B2');
      expect(st().getIssueById('a')).toBe(a); // item não alterado mantém a referência
      expect(apiMocks.list).not.toHaveBeenCalled();
   });

   it('delta truncado ou store vazio cai na hidratação completa', async () => {
      apiMocks.list.mockResolvedValue([]);
      useIssuesStore.setState({ issues: [], loaded: false });
      await st().resync();
      expect(apiMocks.changes).not.toHaveBeenCalled();
      expect(apiMocks.list).toHaveBeenCalled();

      apiMocks.list.mockClear();
      useIssuesStore.setState({ issues: [issue({ id: 'a' })], loaded: true });
      apiMocks.changes.mockResolvedValueOnce({ data: [], meta: { ids: [], truncated: true } });
      await st().resync();
      expect(apiMocks.list).toHaveBeenCalled();
   });

   it('não remove a issue otimista ainda em criação', async () => {
      const temp = issue({ id: 'temp', updatedAt: '2026-03-01T00:00:00.000Z' });
      useIssuesStore.setState({ issues: [issue({ id: 'a' }), temp] });
      const create = deferred<IssueDto>();
      (apiMocks as unknown as { create: ReturnType<typeof vi.fn> }).create = vi
         .fn()
         .mockReturnValueOnce(create.promise);
      const pending = st().addIssue(issue({ id: 'temp2' }));
      apiMocks.changes.mockResolvedValueOnce({ data: [], meta: { ids: ['a'], truncated: false } });
      await st().resync();
      expect(st().issues.map((i) => i.id)).toEqual(['a', 'temp2']);
      create.resolve(dto({ id: 'real' }));
      await pending;
   });

   it('não expõe mais os filtros mortos (filterBy*, R8)', () => {
      const s = st() as unknown as Record<string, unknown>;
      for (const k of ['filterByStatus', 'filterByAssignee', 'filterIssues', 'searchIssues'])
         expect(k in s).toBe(false);
   });
});
