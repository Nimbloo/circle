// @vitest-environment jsdom

import './setup-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { status } from './helpers/catalog-fixture';
import { seedCatalog } from './helpers/catalog-fixture';
import { adaptIssue } from '@/lib/adapters';
import type { IssueDto } from '@/lib/api/issues';

/**
 * CodeRabbit #190: durante a janela do Undo o DELETE ainda não saiu, então uma
 * hidratação (hydrate/resync/applyDto) traz a issue de volta do servidor.
 */

const apiMocks = vi.hoisted(() => ({
   list: vi.fn(),
   get: vi.fn(),
   changes: vi.fn(),
   remove: vi.fn(),
}));
vi.mock('@/lib/client', () => ({ api: { issues: apiMocks } }));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const { useIssuesStore } = await import('@/store/issues-store');
const { deleteIssuesWithUndo } = await import('@/components/common/issues/delete-with-undo');

const dto = (id: string, over: Partial<IssueDto> = {}): IssueDto =>
   ({
      id,
      identifier: `ENG-${id}`,
      teamId: 'ENG',
      title: `Issue ${id}`,
      status: { id: status[0].id, name: status[0].name, color: '', category: status[0].category },
      priority: { id: 'no-priority', name: 'No priority' },
      assignee: null,
      assignees: [],
      createdBy: null,
      project: null,
      cycleId: '',
      labels: [],
      rank: `0|a${id}`,
      dueDate: null,
      estimate: null,
      subIssueCount: 0,
      subIssueDoneCount: 0,
      snoozedUntil: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...over,
   }) as unknown as IssueDto;

interface UndoToastOptions {
   onAutoClose?: () => void;
   action?: { onClick: () => void };
}
const undoToast = () =>
   toastMock.mock.calls.findLast((c) => (c[1] as UndoToastOptions | undefined)?.action)?.[1] as
      | UndoToastOptions
      | undefined;

const ids = () => useIssuesStore.getState().issues.map((i) => i.id);
const server = () => [dto('a'), dto('b'), dto('c')];

beforeEach(() => {
   vi.clearAllMocks();
   vi.useFakeTimers();
   seedCatalog();
   apiMocks.list.mockImplementation(async () => server());
   useIssuesStore.setState({
      issues: server().map(adaptIssue),
      loaded: true,
      remoteDeletedIds: new Set(),
   });
});
afterEach(() => {
   // Fecha qualquer janela aberta para não vazar a marca de exclusão entre testes.
   undoToast()?.action?.onClick();
   vi.useRealTimers();
});

describe('delete com Undo × hidratação (CodeRabbit #190)', () => {
   it('hydrate durante a janela não traz a issue de volta; o Undo traz', async () => {
      deleteIssuesWithUndo(['b']);
      await useIssuesStore.getState().hydrate();
      expect(ids()).toEqual(['a', 'c']);

      undoToast()!.action!.onClick();
      expect(ids()).toEqual(['a', 'b', 'c']);
      // Depois do Undo a marca some: a próxima hidratação mantém a issue.
      await useIssuesStore.getState().hydrate();
      expect(ids()).toEqual(['a', 'b', 'c']);
   });

   it('applyDto e resync durante a janela também não a revivem', async () => {
      deleteIssuesWithUndo(['b']);
      useIssuesStore.getState().applyDto(dto('b', { updatedAt: '2026-02-01T00:00:00.000Z' }));
      expect(ids()).toEqual(['a', 'c']);

      apiMocks.changes.mockResolvedValueOnce({
         data: [dto('b', { updatedAt: '2026-03-01T00:00:00.000Z' })],
         meta: { ids: ['a', 'b', 'c'] },
      });
      await useIssuesStore.getState().resync();
      expect(ids()).toEqual(['a', 'c']);
   });

   it('com o DELETE em voo a marca segue; falhou: a issue volta e a marca sai', async () => {
      let fail!: (e: unknown) => void;
      apiMocks.remove.mockReturnValueOnce(new Promise((_, rej) => (fail = rej)));
      deleteIssuesWithUndo(['b']);
      undoToast()!.onAutoClose!();
      expect(apiMocks.remove).toHaveBeenCalledWith('b');

      await useIssuesStore.getState().hydrate();
      expect(ids()).toEqual(['a', 'c']);

      fail(Object.assign(new Error('boom'), { status: 500 }));
      await vi.waitFor(() => expect(ids()).toEqual(['a', 'b', 'c']));
      await useIssuesStore.getState().hydrate();
      expect(ids()).toEqual(['a', 'b', 'c']);
   });
});
