// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import { priorities } from '@/data/priorities';
import { status } from './helpers/catalog-fixture';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useNotificationsStore } from '@/store/notifications-store';

const apiMocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/lib/client', () => ({ api: { search: { query: apiMocks.search } } }));
const nav = vi.hoisted(() => ({ pathname: '/nimbloo/issue/ENG-1' }));
vi.mock('next/navigation', () => ({
   usePathname: () => nav.pathname,
   useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CommandPalette } from '@/components/layout/command-palette';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Radix usa pointer capture, que o jsdom não implementa.
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

const make = (id: string, identifier: string, title: string): Issue => ({
   id,
   identifier,
   title,
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
});

beforeEach(() => {
   vi.clearAllMocks();
   apiMocks.search.mockResolvedValue({ query: '', fallback: false, semantic: false, groups: [] });
   nav.pathname = '/nimbloo/issue/ENG-1';
   useIssuesStore.setState({
      issues: [make('a', 'ENG-1', 'Login quebrado'), make('b', 'ENG-2', 'Cache de catálogo')],
   });
   useWorkspaceStore.setState({
      projects: [],
      users: [],
      cycles: [],
      teams: [],
      views: [],
      me: null,
   });
   useNotificationsStore.setState({ selectedNotification: undefined });
});

const openPalette = async () => {
   fireEvent.keyDown(window, { key: 'k', metaKey: true });
   return screen.findByPlaceholderText(/Digite um comando ou pesquise/i);
};

const rowOf = (text: string) => screen.getByText(text).closest('[cmdk-item]') as HTMLElement;

describe('⌘K com issue em contexto (co#4/#5)', () => {
   it('mantém Go to e busca outras issues numa página de issue', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<CommandPalette />);
      const input = await openPalette();
      expect(screen.getByText('Change status…')).toBeTruthy();
      expect(screen.getByText('Inbox')).toBeTruthy();
      await user.type(input, 'cache');
      expect(await screen.findByText('Cache de catálogo')).toBeTruthy();
   });

   it('dicas de tecla vêm da tabela única', async () => {
      useWorkspaceStore.setState({
         users: [{ id: 'u1', name: 'Ana' } as never],
         me: { id: 'u1' } as never,
      });
      render(<CommandPalette />);
      await openPalette();
      expect(within(rowOf('Change status…')).getByText('S')).toBeTruthy();
      const inbox = within(rowOf('Inbox'));
      expect(inbox.getByText('G')).toBeTruthy();
      expect(inbox.getByText('I')).toBeTruthy();
      expect(within(rowOf('Assign to me')).getByText('I')).toBeTruthy();
      // Atalhos que não existem não são anunciados.
      expect(rowOf('Copy issue title').querySelector('kbd')).toBeNull();
   });

   it('Esc numa sub-página volta à raiz sem fechar', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<CommandPalette />);
      await openPalette();
      await user.click(screen.getByText('Change status…'));
      expect(screen.queryByText('Set priority…')).toBeNull();
      await user.keyboard('{Escape}');
      expect(await screen.findByText('Set priority…')).toBeTruthy();
      expect(screen.getByRole('dialog')).toBeTruthy();
   });

   it('abre direto numa sub-página pelo evento (fallback das teclas da issue)', async () => {
      render(<CommandPalette />);
      act(() => {
         window.dispatchEvent(
            new CustomEvent('circle:open-command', { detail: { page: 'priority' } })
         );
      });
      expect(
         await screen.findByText('Set priority…', { selector: '[cmdk-group-heading]' })
      ).toBeTruthy();
   });

   it('usa a issue da notificação aberta no inbox', async () => {
      nav.pathname = '/nimbloo/inbox';
      useNotificationsStore.setState({
         selectedNotification: { identifier: 'ENG-2' } as never,
      });
      render(<CommandPalette />);
      await openPalette();
      expect(screen.getByText('Cache de catálogo')).toBeTruthy();
      expect(screen.getByText('Change status…')).toBeTruthy();
   });

   it('abrir o ⌘K fecha um menu aberto por baixo (co#9)', async () => {
      render(
         <>
            <DropdownMenu defaultOpen>
               <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
               <DropdownMenuContent>
                  <DropdownMenuItem>Item do menu</DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
            <CommandPalette />
         </>
      );
      expect(screen.getByText('Item do menu')).toBeTruthy();
      await openPalette();
      expect(screen.queryByText('Item do menu')).toBeNull();
   });
});
