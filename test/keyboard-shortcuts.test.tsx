// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from './helpers/catalog-fixture';

const nav = vi.hoisted(() => ({ pathname: '/nimbloo/team/ENG/all', push: vi.fn() }));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => nav.pathname,
   useRouter: () => ({ push: nav.push }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const logOut = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logout', () => ({ logOut }));

import { KeyboardShortcuts } from '@/components/layout/keyboard-shortcuts';
import { ISSUE_SHORTCUT_EVENT, OPEN_COMMAND_EVENT } from '@/lib/shortcuts';
import { useIssuesStore } from '@/store/issues-store';
import { useSearchStore } from '@/store/search-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { MeDto } from '@/lib/api/users';
import type { User } from '@/data/users';

/**
 * co#5/#6/#15 — o listener lê a tabela única: G+tecla no padrão do Linear, teclas da
 * issue viram `circle:issue-shortcut` (com o ⌘K como fallback), `/` só onde há busca e
 * `?` abre o painel de atalhos.
 */
const issue: Issue = {
   id: 'a',
   identifier: 'ENG-1',
   title: 'Login quebrado',
   description: '',
   status: status[0],
   priority: priorities.find((p) => p.id === 'no-priority')!,
   assignee: null,
   assignees: [],
   labels: [],
   createdAt: '2026-01-01T00:00:00.000Z',
   cycleId: '',
   rank: 'a',
   teamId: 'ENG',
};
const meUser = { id: 'u1', name: 'Ana', email: 'ana@x', avatarUrl: '' } as User;

const press = (key: string, init: KeyboardEventInit = {}) =>
   act(() => {
      fireEvent.keyDown(window, { key, ...init });
   });

beforeEach(() => {
   nav.pathname = '/nimbloo/team/ENG/all';
   nav.push.mockReset();
   useSearchStore.setState({ isSearchOpen: false, searchQuery: '' });
   useIssuesStore.setState({ issues: [issue] });
   useWorkspaceStore.setState({ users: [meUser], me: { id: 'u1' } as MeDto });
});

describe('atalhos globais', () => {
   it('G + I vai para o Inbox e G + M para My issues (Linear)', () => {
      render(<KeyboardShortcuts />);
      press('g');
      press('i');
      expect(nav.push).toHaveBeenLastCalledWith('/nimbloo/inbox');
      press('g');
      press('m');
      expect(nav.push).toHaveBeenLastCalledWith('/nimbloo/my-issues');
   });

   it('`/` só liga a busca onde há lista de issues', () => {
      nav.pathname = '/nimbloo/inbox';
      const { unmount } = render(<KeyboardShortcuts />);
      press('/');
      expect(useSearchStore.getState().isSearchOpen).toBe(false);
      unmount();
      nav.pathname = '/nimbloo/team/ENG/all';
      render(<KeyboardShortcuts />);
      press('/');
      expect(useSearchStore.getState().isSearchOpen).toBe(true);
   });

   it('`?` abre o painel de atalhos com a tabela', async () => {
      render(<KeyboardShortcuts />);
      press('?', { shiftKey: true });
      expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
      expect(screen.getByText('Change status')).toBeTruthy();
      expect(screen.getByText('Go to Inbox')).toBeTruthy();
   });
});

describe('teclas da issue', () => {
   it('S no detalhe dispara circle:issue-shortcut e o painel trata', () => {
      nav.pathname = '/nimbloo/issue/ENG-1';
      const onShortcut = vi.fn((e: Event) => e.preventDefault());
      const onOpen = vi.fn();
      window.addEventListener(ISSUE_SHORTCUT_EVENT, onShortcut);
      window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
      render(<KeyboardShortcuts />);
      press('s');
      expect((onShortcut.mock.calls[0][0] as CustomEvent).detail).toEqual({ action: 'status' });
      expect(onOpen).not.toHaveBeenCalled();
      window.removeEventListener(ISSUE_SHORTCUT_EVENT, onShortcut);
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpen);
   });

   it('sem ninguém tratando, abre o ⌘K na sub-página', () => {
      nav.pathname = '/nimbloo/issue/ENG-1';
      const onOpen = vi.fn();
      window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
      render(<KeyboardShortcuts />);
      press('P', { shiftKey: true });
      expect((onOpen.mock.calls[0][0] as CustomEvent).detail).toEqual({ page: 'project' });
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpen);
   });

   it('fora de uma issue, S não faz nada', () => {
      const onShortcut = vi.fn();
      window.addEventListener(ISSUE_SHORTCUT_EVENT, onShortcut);
      render(<KeyboardShortcuts />);
      press('s');
      expect(onShortcut).not.toHaveBeenCalled();
      window.removeEventListener(ISSUE_SHORTCUT_EVENT, onShortcut);
   });

   it('I atribui a mim', () => {
      nav.pathname = '/nimbloo/issue/ENG-1';
      const updateIssueAssignee = vi.fn(async () => {});
      useIssuesStore.setState({ updateIssueAssignee } as never);
      render(<KeyboardShortcuts />);
      press('i');
      expect(updateIssueAssignee).toHaveBeenCalledWith('a', meUser);
   });
});

describe('⌥⇧Q sai da conta (paridade Linear)', () => {
   beforeEach(() => logOut.mockReset());

   it('dispara o mesmo logout do menu, também no Mac (key vira "Œ", o code é KeyQ)', () => {
      render(<KeyboardShortcuts />);
      press('Œ', { code: 'KeyQ', altKey: true, shiftKey: true });
      expect(logOut).toHaveBeenCalledTimes(1);
   });

   it('não dispara digitando num input nem sem o Shift', () => {
      render(
         <>
            <KeyboardShortcuts />
            <input aria-label="campo" />
         </>
      );
      act(() => {
         fireEvent.keyDown(screen.getByLabelText('campo'), {
            key: 'Œ',
            code: 'KeyQ',
            altKey: true,
            shiftKey: true,
         });
      });
      press('œ', { code: 'KeyQ', altKey: true });
      expect(logOut).not.toHaveBeenCalled();
   });
});
