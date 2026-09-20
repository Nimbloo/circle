import { beforeEach, describe, expect, it, vi } from 'vitest';
import { status } from '@/data/status';
import { labels } from '@/data/labels';
import { adaptIssue } from '@/lib/adapters';
import type { IssueDto } from '@/lib/api/issues';

const apiMocks = vi.hoisted(() => ({
   list: vi.fn(),
   get: vi.fn(),
   create: vi.fn(),
   update: vi.fn(),
   remove: vi.fn(),
   addLabel: vi.fn(),
   removeLabel: vi.fn(),
}));

vi.mock('@/lib/client', () => ({ api: { issues: apiMocks } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { useIssuesStore } = await import('@/store/issues-store');

const dto = (over: Partial<IssueDto> & { id: string }): IssueDto =>
   ({
      identifier: `ENG-${over.id}`,
      teamId: 'ENG',
      title: `Issue ${over.id}`,
      status: { id: status[0].id, name: status[0].name, color: '', category: status[0].category },
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

beforeEach(() => {
   vi.clearAllMocks();
   useIssuesStore.setState({ issues: [], loaded: false, loading: false, error: false });
});

describe('issues-store — loaded (#4)', () => {
   it('nasce sem loaded e só vira loaded quando a 1ª hidratação termina', async () => {
      expect(useIssuesStore.getState().loaded).toBe(false);
      const page = deferred<IssueDto[]>();
      apiMocks.list.mockReturnValueOnce(page.promise);
      const pending = useIssuesStore.getState().hydrate();
      expect(useIssuesStore.getState().loaded).toBe(false);
      page.resolve([dto({ id: '1' })]);
      await pending;
      expect(useIssuesStore.getState().loaded).toBe(true);
      expect(useIssuesStore.getState().loading).toBe(false);
   });

   it('falha mantém loaded=false e sinaliza error', async () => {
      apiMocks.list.mockRejectedValueOnce(new Error('boom'));
      await useIssuesStore.getState().hydrate();
      expect(useIssuesStore.getState().loaded).toBe(false);
      expect(useIssuesStore.getState().error).toBe(true);
   });
});

describe('issues-store — ordem por rank (#1)', () => {
   it('ordena por comparação binária do rank (igual ao servidor, sem localeCompare)', async () => {
      apiMocks.list.mockResolvedValueOnce([
         dto({ id: '1', rank: '0|b' }),
         dto({ id: '2', rank: '0|B' }),
         dto({ id: '3', rank: '0|a' }),
      ]);
      await useIssuesStore.getState().hydrate();
      expect(useIssuesStore.getState().issues.map((i) => i.rank)).toEqual(['0|B', '0|a', '0|b']);
   });

   it('não expõe mais issuesByStatus (sem leitor)', () => {
      expect('issuesByStatus' in useIssuesStore.getState()).toBe(false);
   });
});

describe('issues-store — hidratações concorrentes e updatedAt (#16)', () => {
   it('a hidratação mais antiga é descartada quando outra começou depois', async () => {
      useIssuesStore.setState({ issues: [issue({ id: 'x' })], loaded: true });
      const old = deferred<IssueDto[]>();
      const recent = deferred<IssueDto[]>();
      apiMocks.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(recent.promise);
      const first = useIssuesStore.getState().hydrate();
      const second = useIssuesStore.getState().hydrate();
      recent.resolve([dto({ id: 'x', title: 'novo' })]);
      await second;
      old.resolve([dto({ id: 'x', title: 'velho' })]);
      await first;
      expect(useIssuesStore.getState().issues.map((i) => i.title)).toEqual(['novo']);
   });

   it('hidratação não sobrescreve item mais novo que já está no store', async () => {
      useIssuesStore.setState({
         issues: [issue({ id: 'x', title: 'recente', updatedAt: '2026-02-02T00:00:00.000Z' })],
         loaded: true,
      });
      apiMocks.list.mockResolvedValueOnce([
         dto({ id: 'x', title: 'velho', updatedAt: '2026-02-01T00:00:00.000Z' }),
      ]);
      await useIssuesStore.getState().hydrate();
      expect(useIssuesStore.getState().issues[0].title).toBe('recente');
   });

   it('applyRemote ignora resposta mais velha que o item do store', async () => {
      useIssuesStore.setState({
         issues: [issue({ id: 'x', title: 'recente', updatedAt: '2026-02-02T00:00:00.000Z' })],
      });
      apiMocks.get.mockResolvedValueOnce(
         dto({ id: 'x', title: 'velho', updatedAt: '2026-02-01T00:00:00.000Z' })
      );
      await useIssuesStore.getState().applyRemote('x');
      expect(useIssuesStore.getState().issues[0].title).toBe('recente');
   });
});

describe('issues-store — rollback por item/campo (#15)', () => {
   it('updateIssue: rollback só do campo da issue; mudança remota em outra sobrevive', async () => {
      useIssuesStore.setState({ issues: [issue({ id: 'a' }), issue({ id: 'b' })] });
      const req = deferred<IssueDto>();
      apiMocks.update.mockReturnValueOnce(req.promise);
      const p = useIssuesStore.getState().updateIssue('a', { title: 'otimista' });
      // Chega uma mudança remota na issue b durante o voo.
      apiMocks.get.mockResolvedValueOnce(
         dto({ id: 'b', title: 'remoto', updatedAt: '2026-03-01T00:00:00.000Z' })
      );
      await useIssuesStore.getState().applyRemote('b');
      req.reject(new Error('500'));
      await expect(p).rejects.toThrow('500');
      const s = useIssuesStore.getState();
      expect(s.getIssueById('a')?.title).toBe('Issue a');
      expect(s.getIssueById('b')?.title).toBe('remoto');
   });

   it('deleteIssue: rollback reinsere só a issue apagada', async () => {
      useIssuesStore.setState({ issues: [issue({ id: 'a' }), issue({ id: 'b' })] });
      const req = deferred<{ deleted: boolean }>();
      apiMocks.remove.mockReturnValueOnce(req.promise);
      const p = useIssuesStore.getState().deleteIssue('a');
      apiMocks.get.mockResolvedValueOnce(
         dto({ id: 'b', title: 'remoto', updatedAt: '2026-03-01T00:00:00.000Z' })
      );
      await useIssuesStore.getState().applyRemote('b');
      req.reject(new Error('500'));
      await expect(p).rejects.toThrow('500');
      const s = useIssuesStore.getState();
      expect(s.issues.map((i) => i.id)).toEqual(['a', 'b']);
      expect(s.getIssueById('b')?.title).toBe('remoto');
   });

   it('labels: rollback desfaz só a label daquela issue', async () => {
      useIssuesStore.setState({ issues: [issue({ id: 'a' }), issue({ id: 'b' })] });
      const req = deferred<IssueDto>();
      apiMocks.addLabel.mockReturnValueOnce(req.promise);
      const p = useIssuesStore.getState().addIssueLabel('a', labels[0]);
      apiMocks.get.mockResolvedValueOnce(
         dto({ id: 'b', title: 'remoto', updatedAt: '2026-03-01T00:00:00.000Z' })
      );
      await useIssuesStore.getState().applyRemote('b');
      req.reject(new Error('500'));
      await expect(p).rejects.toThrow('500');
      const s = useIssuesStore.getState();
      expect(s.getIssueById('a')?.labels).toEqual([]);
      expect(s.getIssueById('b')?.title).toBe('remoto');
   });
});

describe('issues-store — addIssue sem duplicar (#33)', () => {
   it('evento created chega antes da resposta: fica uma issue só', async () => {
      const req = deferred<IssueDto>();
      apiMocks.create.mockReturnValueOnce(req.promise);
      const optimistic = issue({ id: 'temp' });
      const p = useIssuesStore.getState().addIssue(optimistic);
      apiMocks.get.mockResolvedValueOnce(dto({ id: 'real' }));
      await useIssuesStore.getState().applyRemote('real');
      req.resolve(dto({ id: 'real' }));
      await p;
      expect(useIssuesStore.getState().issues.map((i) => i.id)).toEqual(['real']);
   });
});

describe('issues-store — selectIssuesLoading (#4, sem flash de vazio)', () => {
   it('store recém-criado conta como carregando; erro e sucesso encerram', async () => {
      const { selectIssuesLoading } = await import('@/store/issues-store');
      expect(selectIssuesLoading(useIssuesStore.getState())).toBe(true);
      apiMocks.list.mockRejectedValueOnce(new Error('boom'));
      await useIssuesStore.getState().hydrate();
      expect(selectIssuesLoading(useIssuesStore.getState())).toBe(false);
      apiMocks.list.mockResolvedValueOnce([]);
      await useIssuesStore.getState().hydrate();
      expect(selectIssuesLoading(useIssuesStore.getState())).toBe(false);
      expect(useIssuesStore.getState().loaded).toBe(true);
   });
});

describe('issues-store — referências a projeto/ciclo removidos (#13)', () => {
   it('detachProject/detachCycle limpam as issues que apontavam pro removido', () => {
      const project = { id: 'p1', name: 'P1' };
      useIssuesStore.setState({
         issues: [
            issue({ id: 'a', project, cycleId: 'c1' } as never),
            issue({ id: 'b', cycleId: 'c2' }),
         ],
      });
      useIssuesStore.getState().detachProject('p1');
      useIssuesStore.getState().detachCycle('c1');
      const s = useIssuesStore.getState();
      expect(s.getIssueById('a')?.project).toBeUndefined();
      expect(s.getIssueById('a')?.cycleId).toBe('');
      expect(s.getIssueById('b')?.cycleId).toBe('c2');
   });
});
