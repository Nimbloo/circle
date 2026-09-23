// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssigneeAvatars } from '@/components/common/issues/assignee-avatars';
import { AssigneeSelector } from '@/components/layout/sidebar/create-new-issue/assignee-selector';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { User } from '@/data/users';
import { usePreferencesStore } from '@/store/preferences-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const ana: User = {
   id: 'u-ana',
   name: 'Ana Souza',
   avatarUrl: '',
   email: 'ana.souza@nimbloo.ai',
   slug: 'ana',
   status: 'online',
   role: 'Member',
   joinedDate: '2026-01-01',
   teamIds: [],
   timezone: 'UTC',
};
const bob: User = {
   ...ana,
   id: 'u-bob',
   name: 'Bob Lima',
   email: 'bob@nimbloo.ai',
   slug: undefined,
};

describe('preferência "Display names"', () => {
   it('Full name mostra o nome; Username mostra o handle (slug, ou prefixo do e-mail)', () => {
      useWorkspaceStore.setState({ users: [ana, bob], me: null });
      act(() => usePreferencesStore.getState().setPref('displayNames', 'Full name'));
      const { rerender } = render(
         <TooltipProvider>
            <AssigneeAvatars users={[ana, bob]} />
            <AssigneeSelector assignees={[ana]} onChange={() => {}} />
         </TooltipProvider>
      );
      expect(screen.getByLabelText('Assignees: Ana Souza e Bob Lima')).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Assignees: Ana Souza' })).toBeTruthy();

      act(() => usePreferencesStore.getState().setPref('displayNames', 'Username'));
      rerender(
         <TooltipProvider>
            <AssigneeAvatars users={[ana, bob]} />
            <AssigneeSelector assignees={[ana]} onChange={() => {}} />
         </TooltipProvider>
      );
      expect(screen.getByLabelText('Assignees: ana e bob')).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Assignees: ana' })).toBeTruthy();
   });
});
