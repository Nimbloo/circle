// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateNewIssue } from '@/components/layout/sidebar/create-new-issue';
import { SubIssueCreate } from '@/components/common/issues/details/sub-issue-create';
import { seedCatalog } from './helpers/catalog-fixture';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { useIssuesStore } from '@/store/issues-store';
import type { User } from '@/data/users';
import type { MeDto } from '@/lib/api/users';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({
   api: { teams: { templates: vi.fn(async () => []) }, issues: { create: createMock } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo', teamId: 'ENG' }),
   usePathname: () => '/nimbloo/team/ENG/all',
}));
vi.mock('@/components/common/editor/block-editor', () => ({
   BlockEditor: () => <div data-testid="block-editor" />,
}));

const ana: User = {
   id: 'u-ana',
   name: 'Ana Souza',
   avatarUrl: '',
   email: 'ana@nimbloo.ai',
   slug: 'ana',
   status: 'online',
   role: 'Member',
   joinedDate: '2026-01-01',
   teamIds: ['ENG'],
   timezone: 'UTC',
};
const me: MeDto = {
   id: 'u-ana',
   slug: 'ana',
   name: 'Ana Souza',
   email: 'ana@nimbloo.ai',
   avatarUrl: null,
   role: 'Member',
   admin: false,
   teamIds: ['ENG'],
   subscribedIssueIds: [],
   githubLogin: null,
};

const titleInput = () => screen.getByPlaceholderText('Título da issue') as HTMLInputElement;

async function createFromModal() {
   const user = userEvent.setup();
   render(<CreateNewIssue />);
   act(() => useCreateIssueStore.getState().openModal());
   await user.type(titleInput(), 'Nova');
   await user.keyboard('{Control>}{Enter}{/Control}');
   await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
   return createMock.mock.calls[0][0] as { assigneeId: string | null; assigneeIds: string[] };
}

describe('preferência "Auto-assign to self"', () => {
   beforeEach(() => {
      seedCatalog();
      createMock.mockReset();
      createMock.mockRejectedValue(new Error('offline'));
      act(() => useCreateIssueStore.setState({ isOpen: false, defaultDrop: null }));
      useWorkspaceStore.setState({ teams: [], users: [ana], projects: [], me });
   });

   it('ligada: issue nova do modal nasce atribuída a mim', async () => {
      usePreferencesStore.getState().setPref('autoAssignSelf', true);
      const input = await createFromModal();
      expect(input.assigneeId).toBe('u-ana');
      expect(input.assigneeIds).toEqual(['u-ana']);
   });

   it('desligada: issue nova do modal nasce sem responsável', async () => {
      usePreferencesStore.getState().setPref('autoAssignSelf', false);
      const input = await createFromModal();
      expect(input.assigneeId).toBeNull();
      expect(input.assigneeIds).toEqual([]);
   });

   it('o "+" da coluna "No assignee" respeita a escolha explícita (sem responsável)', async () => {
      usePreferencesStore.getState().setPref('autoAssignSelf', true);
      const user = userEvent.setup();
      render(<CreateNewIssue />);
      act(() => useCreateIssueStore.getState().openModal({ field: 'assignee', assignee: null }));
      await user.type(titleInput(), 'Nova');
      await user.keyboard('{Control>}{Enter}{/Control}');
      await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
      expect(createMock.mock.calls[0][0].assigneeIds).toEqual([]);
   });

   it('sub-issue inline: atribuída a mim só com a preferência ligada', async () => {
      createMock.mockResolvedValue({ id: 'srv-1' });
      useIssuesStore.setState({ applyRemote: vi.fn(async () => {}) });
      for (const [on, expected] of [
         [true, 'u-ana'],
         [false, undefined],
      ] as const) {
         createMock.mockClear();
         usePreferencesStore.getState().setPref('autoAssignSelf', on);
         const user = userEvent.setup();
         const { unmount } = render(<SubIssueCreate parentId="p-1" onCreated={() => {}} />);
         await user.click(screen.getByText('Create sub-issue'));
         await user.keyboard('Filha{Enter}');
         await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
         expect(createMock.mock.calls[0][0].assigneeId).toBe(expected);
         unmount();
      }
   });
});
