import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import type { User } from '@/data/users';
import type { MeDto } from '@/lib/api/users';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { usePreferencesStore } from '@/store/preferences-store';

const updateMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({ api: { issues: { update: updateMock } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const byId = (id: string) => status.find((s) => s.id === id)!;
const ana = { id: 'u-ana', name: 'Ana', teamIds: ['ENG'] } as User;
const bia = { id: 'u-bia', name: 'Bia', teamIds: ['ENG'] } as User;
const me = { id: 'u-ana', teamIds: ['ENG'] } as MeDto;

const base: Issue = {
   id: 'i1',
   identifier: 'ENG-1',
   title: 'Issue',
   description: '',
   status: byId('to-do'),
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: 'a',
   teamId: 'ENG',
};

describe('preferência "On move to started status, assign to yourself"', () => {
   beforeEach(() => {
      seedCatalog();
      updateMock.mockReset();
      updateMock.mockResolvedValue(undefined);
      useWorkspaceStore.setState({ users: [ana, bia], me });
   });

   it('ligada: issue sem responsável movida para started fica comigo', async () => {
      usePreferencesStore.getState().setPref('assignSelfOnStart', true);
      useIssuesStore.setState({ issues: [base] });
      await useIssuesStore.getState().updateIssueStatus('i1', byId('in-progress'));
      expect(updateMock).toHaveBeenCalledWith(
         'i1',
         expect.objectContaining({ statusId: 'in-progress', assigneeIds: ['u-ana'] })
      );
      expect(useIssuesStore.getState().getIssueById('i1')?.assignee?.id).toBe('u-ana');
   });

   it('desligada, status não-started ou issue já atribuída: só troca o status', async () => {
      usePreferencesStore.getState().setPref('assignSelfOnStart', false);
      useIssuesStore.setState({ issues: [base] });
      await useIssuesStore.getState().updateIssueStatus('i1', byId('in-progress'));
      expect(updateMock.mock.calls[0][1]).toEqual({ statusId: 'in-progress' });

      usePreferencesStore.getState().setPref('assignSelfOnStart', true);
      useIssuesStore.setState({ issues: [base] });
      await useIssuesStore.getState().updateIssueStatus('i1', byId('done'));
      expect(updateMock.mock.calls[1][1]).toEqual({ statusId: 'done' });

      useIssuesStore.setState({ issues: [{ ...base, assignee: bia, assignees: [bia] }] });
      await useIssuesStore.getState().updateIssueStatus('i1', byId('in-progress'));
      expect(updateMock.mock.calls[2][1]).toEqual({ statusId: 'in-progress' });
   });

   it('entre dois status "started" não atribui (não é iniciar a issue)', async () => {
      usePreferencesStore.getState().setPref('assignSelfOnStart', true);
      useIssuesStore.setState({ issues: [{ ...base, status: byId('in-progress') }] });
      await useIssuesStore.getState().updateIssueStatus('i1', byId('technical-review'));
      expect(updateMock.mock.calls[0][1]).toEqual({ statusId: 'technical-review' });
   });
});
