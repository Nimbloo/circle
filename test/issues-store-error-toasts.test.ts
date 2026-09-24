import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { labels, seedCatalog, status } from './helpers/catalog-fixture';
import { ISSUE_LABEL_TOAST, ISSUE_MUTATION_TOAST, useIssuesStore } from '@/store/issues-store';

/**
 * Auditoria de toasts (itens 4 e 8): o store escondia o motivo do 4xx ("Project é de outro
 * time", ciclo de parent, "Só uma label do grupo … por issue") atrás de um texto genérico,
 * e as falhas de label (N add/remove disparados juntos) não tinham id — viravam rajada.
 */

const apiMocks = vi.hoisted(() => ({
   update: vi.fn(),
   addLabel: vi.fn(),
   removeLabel: vi.fn(),
}));
vi.mock('@/lib/client', () => ({
   api: {
      issues: {
         update: apiMocks.update,
         addLabel: apiMocks.addLabel,
         removeLabel: apiMocks.removeLabel,
      },
   },
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const apiError = (status: number, message: string) => Object.assign(new Error(message), { status });

const issue = (): Issue => ({
   id: 'i1',
   identifier: 'ENG-1',
   title: 'x',
   description: '',
   status: status[0],
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [labels[0]],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: 'a',
   teamId: 'ENG',
});

beforeEach(() => {
   vi.clearAllMocks();
   seedCatalog();
   useIssuesStore.setState({ issues: [issue()] });
});

describe('issues-store — toasts de erro com o motivo da API', () => {
   it('update 400 mostra o detail do servidor no toast único de mutação', async () => {
      apiMocks.update.mockRejectedValue(apiError(400, 'Project é de outro time'));
      await expect(
         useIssuesStore.getState().updateIssue('i1', { title: 'y' })
      ).rejects.toBeTruthy();
      expect(toastMock.error).toHaveBeenCalledWith(
         'Falha ao atualizar a issue: Project é de outro time',
         { id: ISSUE_MUTATION_TOAST }
      );
   });

   it('update 500 fica no texto genérico', async () => {
      apiMocks.update.mockRejectedValue(apiError(500, 'Internal Server Error'));
      await expect(
         useIssuesStore.getState().updateIssue('i1', { title: 'y' })
      ).rejects.toBeTruthy();
      expect(toastMock.error).toHaveBeenCalledWith('Falha ao atualizar a issue', {
         id: ISSUE_MUTATION_TOAST,
      });
   });

   it('add label 400 mostra o motivo e usa id (rajada colapsa num toast)', async () => {
      apiMocks.addLabel.mockRejectedValue(apiError(400, 'Só uma label do grupo Tipo por issue'));
      await Promise.allSettled([
         useIssuesStore.getState().addIssueLabel('i1', labels[1]),
         useIssuesStore.getState().addIssueLabel('i1', labels[2]),
      ]);
      expect(toastMock.error).toHaveBeenCalledWith(
         'Falha ao adicionar a label: Só uma label do grupo Tipo por issue',
         { id: ISSUE_LABEL_TOAST }
      );
      for (const call of toastMock.error.mock.calls) expect(call[1]).toEqual({ id: ISSUE_LABEL_TOAST });
   });

   it('remove label com falha usa o mesmo id e o motivo', async () => {
      apiMocks.removeLabel.mockRejectedValue(apiError(409, 'Label em uso por automação'));
      await expect(
         useIssuesStore.getState().removeIssueLabel('i1', labels[0].id)
      ).rejects.toBeTruthy();
      expect(toastMock.error).toHaveBeenCalledWith(
         'Falha ao remover a label: Label em uso por automação',
         { id: ISSUE_LABEL_TOAST }
      );
   });
});
