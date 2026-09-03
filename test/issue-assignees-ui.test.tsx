// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssigneeAvatars } from '@/components/common/issues/assignee-avatars';
import { AssigneeUser } from '@/components/common/issues/assignee-user';
import { AssigneeSelector } from '@/components/layout/sidebar/create-new-issue/assignee-selector';
import type { User } from '@/data/users';
import type { MeDto } from '@/lib/api/users';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const user = (id: string, name: string): User => ({
   id,
   name,
   email: `${name.toLowerCase()}@nimbloo.ai`,
   avatarUrl: '',
   status: 'online',
   role: 'Member',
   joinedDate: '2026-01-01',
   teamIds: [],
   timezone: 'UTC',
});

const ana = user('u-ana', 'Ana');
const bob = user('u-bob', 'Bob');
const lia = user('u-lia', 'Lia');
const zed = user('u-zed', 'Zed');
const may = user('u-may', 'May');

const me = {
   id: ana.id,
   name: ana.name,
   email: ana.email,
   subscribedIssueIds: [],
} as unknown as MeDto;

beforeEach(() => {
   useWorkspaceStore.setState({ users: [ana, bob, lia, zed, may], me });
});

describe('AssigneeAvatars — pilha (#96)', () => {
   it('mostra até 3 avatares + "+N" e lista todos os nomes no rótulo', () => {
      render(<AssigneeAvatars users={[ana, bob, lia, zed, may]} />);
      expect(screen.getAllByTestId('assignee-avatar')).toHaveLength(3);
      expect(screen.getByTestId('assignee-overflow').textContent).toBe('+2');
      expect(screen.getByLabelText('Assignees: Ana, Bob, Lia, Zed e May')).toBeTruthy();
   });

   it('sem responsável mostra o placeholder, sem "+N"', () => {
      render(<AssigneeAvatars users={[]} />);
      expect(screen.queryByTestId('assignee-avatar')).toBeNull();
      expect(screen.queryByTestId('assignee-overflow')).toBeNull();
   });
});

describe('AssigneeUser — multi-select nas linhas/cards', () => {
   it('marca um colaborador mantendo o principal e alterna "Assign to me"', async () => {
      const updateIssueAssignees = vi.fn().mockResolvedValue(undefined);
      useIssuesStore.setState({ updateIssueAssignees });
      const u = userEvent.setup();

      render(<AssigneeUser users={[bob, ana]} issueId="i1" />);
      await u.click(screen.getByRole('button', { name: 'Change assignees: Bob e Ana' }));

      const lista = await screen.findByRole('listbox');
      await u.click(within(lista).getByRole('option', { name: /Lia/ }));
      expect(updateIssueAssignees).toHaveBeenLastCalledWith('i1', [bob, ana, lia]);
      // Popover segue aberto para marcar vários.
      expect(screen.getByRole('listbox')).toBeTruthy();

      // "Assign to me": eu já estou no conjunto → toggla para fora.
      await u.click(within(lista).getByText('Assign to me'));
      expect(updateIssueAssignees).toHaveBeenLastCalledWith('i1', [bob]);

      // "No assignee" limpa todos.
      await u.click(within(lista).getByText('No assignee'));
      expect(updateIssueAssignees).toHaveBeenLastCalledWith('i1', []);
   });

   it('busca filtra os membros', async () => {
      useIssuesStore.setState({ updateIssueAssignees: vi.fn().mockResolvedValue(undefined) });
      const u = userEvent.setup();
      render(<AssigneeUser users={[]} issueId="i1" />);
      await u.click(screen.getByRole('button', { name: 'Assign issue' }));
      await u.type(screen.getByPlaceholderText('Assign to...'), 'zed');
      const lista = screen.getByRole('listbox');
      expect(within(lista).getByRole('option', { name: /Zed/ })).toBeTruthy();
      expect(within(lista).queryByRole('option', { name: /Bob/ })).toBeNull();
   });
});

describe('AssigneeSelector — multi-select do modal/sidebar', () => {
   it('devolve o conjunto inteiro a cada toggle; o 1º é o principal', async () => {
      const onChange = vi.fn();
      const u = userEvent.setup();
      render(<AssigneeSelector assignees={[lia]} onChange={onChange} />);

      const trigger = screen.getByRole('combobox', { name: 'Assignees: Lia' });
      await u.click(trigger);
      const lista = await screen.findByRole('listbox');
      await u.click(within(lista).getByRole('option', { name: /Bob/ }));
      expect(onChange).toHaveBeenLastCalledWith([lia, bob]);

      await u.click(within(lista).getByRole('option', { name: /Lia/ }));
      expect(onChange).toHaveBeenLastCalledWith([]);
   });

   it('rótulo resume vários responsáveis como "Principal +N"', () => {
      render(<AssigneeSelector assignees={[lia, bob, zed]} onChange={vi.fn()} />);
      expect(screen.getByRole('combobox', { name: 'Assignees: Lia +2' })).toBeTruthy();
   });
});
