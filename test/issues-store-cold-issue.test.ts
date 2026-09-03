import { beforeEach, describe, expect, it, vi } from 'vitest';
import { status } from '@/data/status';
import { labels } from '@/data/labels';
import { useIssuesStore } from '@/store/issues-store';

const apiMocks = vi.hoisted(() => ({
   update: vi.fn(),
   get: vi.fn(),
   addLabel: vi.fn(),
   removeLabel: vi.fn(),
}));

vi.mock('@/lib/client', () => ({
   api: {
      issues: {
         update: apiMocks.update,
         get: apiMocks.get,
         addLabel: apiMocks.addLabel,
         removeLabel: apiMocks.removeLabel,
      },
   },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** DTO da issue como o servidor devolve após a mutação (é o que `applyRemote` insere). */
const dto = (over: Record<string, unknown> = {}) => ({
   id: 'cold-1',
   identifier: 'ENG-77',
   teamId: 'ENG',
   title: 'Deep link frio',
   status: { id: status[0].id, name: status[0].name, color: '', category: status[0].category },
   priority: { id: 'no-priority', name: 'No priority' },
   assignee: null,
   createdBy: null,
   project: null,
   cycleId: '',
   labels: [],
   rank: 'a',
   dueDate: null,
   estimate: null,
   subIssueCount: 0,
   subIssueDoneCount: 0,
   snoozedUntil: null,
   createdAt: '2026-01-01T00:00:00.000Z',
   updatedAt: '2026-01-01T00:00:00.000Z',
   ...over,
});

/**
 * Issue FORA do store (deep-link frio, ⌘K/context menu antes do hydrate): a mutação
 * precisa chegar na API e o resultado entrar no store (upsert), senão o painel de
 * propriedades nem persiste nem reflete a mudança.
 */
describe('issues-store — mutação em issue fora do store', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      useIssuesStore.setState({ issues: [], issuesByStatus: {} });
   });

   it('updateIssue chama a API e faz upsert via applyRemote', async () => {
      apiMocks.update.mockResolvedValue(dto({ title: 'Renomeada' }));
      apiMocks.get.mockResolvedValue(dto({ title: 'Renomeada' }));

      await useIssuesStore.getState().updateIssue('cold-1', { title: 'Renomeada' });

      expect(apiMocks.update).toHaveBeenCalledWith('cold-1', { title: 'Renomeada' });
      expect(apiMocks.get).toHaveBeenCalledWith('cold-1');
      const issue = useIssuesStore.getState().getIssueById('cold-1');
      expect(issue?.title).toBe('Renomeada');
      expect(useIssuesStore.getState().issuesByStatus[status[0].id]).toHaveLength(1);
   });

   it('addIssueLabel não retorna cedo: persiste e insere a issue no store', async () => {
      const label = labels[0];
      apiMocks.addLabel.mockResolvedValue(dto({ labels: [label] }));
      apiMocks.get.mockResolvedValue(dto({ labels: [label] }));

      await useIssuesStore.getState().addIssueLabel('cold-1', label);

      expect(apiMocks.addLabel).toHaveBeenCalledWith('cold-1', label.id);
      expect(
         useIssuesStore
            .getState()
            .getIssueById('cold-1')
            ?.labels.map((l) => l.id)
      ).toEqual([label.id]);
   });

   it('removeIssueLabel idem', async () => {
      apiMocks.removeLabel.mockResolvedValue(dto());
      apiMocks.get.mockResolvedValue(dto());

      await useIssuesStore.getState().removeIssueLabel('cold-1', labels[0].id);

      expect(apiMocks.removeLabel).toHaveBeenCalledWith('cold-1', labels[0].id);
      expect(useIssuesStore.getState().getIssueById('cold-1')).toBeDefined();
   });

   it('issue já no store: sem GET extra (o otimista basta)', async () => {
      apiMocks.get.mockResolvedValue(dto());
      await useIssuesStore.getState().applyRemote('cold-1');
      apiMocks.get.mockClear();
      apiMocks.update.mockResolvedValue(dto({ title: 'Outra' }));

      await useIssuesStore.getState().updateIssue('cold-1', { title: 'Outra' });

      expect(apiMocks.update).toHaveBeenCalledTimes(1);
      expect(apiMocks.get).not.toHaveBeenCalled();
      expect(useIssuesStore.getState().getIssueById('cold-1')?.title).toBe('Outra');
   });

   it('falha da API: rollback, toast de erro e o erro é propagado', async () => {
      apiMocks.update.mockRejectedValue(new Error('500'));

      await expect(useIssuesStore.getState().updateIssue('cold-1', { title: 'x' })).rejects.toThrow(
         '500'
      );
      expect(apiMocks.get).not.toHaveBeenCalled();
      expect(useIssuesStore.getState().issues).toHaveLength(0);
   });
});
