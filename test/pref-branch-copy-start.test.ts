import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { seedCatalog, status } from './helpers/catalog-fixture';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { startIssueOnBranchCopy } from '@/components/layout/context-issue';

const updateMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({ api: { issues: { update: updateMock } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const byId = (id: string) => status.find((s) => s.id === id)!;
const issueIn = (statusId: string): Issue => ({
   id: 'i1',
   identifier: 'ENG-1',
   title: 'Issue',
   description: '',
   status: byId(statusId),
   priority: priorities[0],
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: 'a',
   teamId: 'ENG',
});

describe('preferência "On git branch copy, move issue to started status"', () => {
   beforeEach(() => {
      seedCatalog();
      updateMock.mockReset();
      updateMock.mockResolvedValue(undefined);
      useWorkspaceStore.setState({ users: [], me: null });
   });

   it('ligada: issue em backlog/unstarted vai para o 1º status started', () => {
      usePreferencesStore.getState().setPref('gitBranchCopyMoveStarted', true);
      for (const from of ['backlog', 'to-do']) {
         updateMock.mockClear();
         const issue = issueIn(from);
         useIssuesStore.setState({ issues: [issue] });
         startIssueOnBranchCopy(issue);
         expect(updateMock).toHaveBeenCalledWith('i1', { statusId: 'in-progress' });
      }
   });

   it('desligada, ou issue já iniciada/concluída: não mexe no status', () => {
      usePreferencesStore.getState().setPref('gitBranchCopyMoveStarted', false);
      startIssueOnBranchCopy(issueIn('to-do'));
      usePreferencesStore.getState().setPref('gitBranchCopyMoveStarted', true);
      startIssueOnBranchCopy(issueIn('technical-review'));
      startIssueOnBranchCopy(issueIn('done'));
      expect(updateMock).not.toHaveBeenCalled();
   });
});
