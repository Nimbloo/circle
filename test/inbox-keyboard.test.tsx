// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Inbox from '@/components/common/inbox/inbox';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore, type InboxNotification } from '@/store/notifications-store';

vi.mock('@/lib/client', () => ({
   api: { inbox: { setRead: vi.fn(async () => ({})), readAll: vi.fn(async () => ({})) } },
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/inbox',
}));
vi.mock('@/components/common/inbox/issue-preview', () => ({ default: () => null }));

/**
 * Inbox (#19 + baixas Co): j/k navegam; "Mark all as read" segue a contagem do servidor
 * (lista capada com todas lidas + badge N não pode desabilitar a ação); o filtro de tipo
 * só oferece tipos que existem; notificação sem issue no store é exibida.
 */
const notif = (n: number, over: Partial<InboxNotification> = {}): InboxNotification => ({
   id: `n${n}`,
   type: 'comment',
   content: `comentário ${n}`,
   user: {
      id: 'u1',
      name: 'Ana Lima',
      avatarUrl: '',
      email: '',
      status: 'offline',
      role: 'Member',
      joinedDate: '2026-01-01',
      teamIds: [],
      timezone: 'UTC',
   },
   read: false,
   sortAt: `2026-09-${String(10 + n).padStart(2, '0')}T00:00:00.000Z`,
   timestamp: '2h',
   snoozedUntil: null,
   issueId: `i${n}`,
   identifier: `OPS-${n}`,
   title: `Issue ${n}`,
   status: null,
   ...over,
});

// Radix (DropdownMenu) usa pointer capture, que o jsdom não implementa.
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

beforeAll(() => {
   Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
         matches: false,
         media: query,
         addEventListener: () => {},
         removeEventListener: () => {},
         addListener: () => {},
         removeListener: () => {},
      }),
   });
});

beforeEach(() => {
   useIssuesStore.setState({ issues: [] });
   useNotificationsStore.setState({
      notifications: [notif(3), notif(2), notif(1)],
      snoozed: [],
      selectedNotification: undefined,
      unreadCount: 3,
      loaded: true,
      loadError: false,
   });
});

const renderInbox = () =>
   render(
      <SidebarProvider>
         <Inbox />
      </SidebarProvider>
   );

describe('inbox — teclado, ações e filtros', () => {
   it('mostra notificação cuja issue não está no store', () => {
      renderInbox();
      expect(screen.getByText('Issue 3')).toBeTruthy();
   });

   it('j/k navegam pela lista e abrem a notificação', () => {
      renderInbox();
      act(() => {
         fireEvent.keyDown(window, { key: 'j' });
      });
      expect(useNotificationsStore.getState().selectedNotification?.id).toBe('n3');
      act(() => {
         fireEvent.keyDown(window, { key: 'j' });
      });
      expect(useNotificationsStore.getState().selectedNotification?.id).toBe('n2');
      act(() => {
         fireEvent.keyDown(window, { key: 'k' });
      });
      expect(useNotificationsStore.getState().selectedNotification?.id).toBe('n3');
   });

   it('"Mark all as read" habilitado pela contagem do servidor', async () => {
      useNotificationsStore.setState({
         notifications: [notif(1, { read: true })],
         unreadCount: 4,
      });
      const user = userEvent.setup();
      renderInbox();
      screen.getByRole('button', { name: 'Notification actions' }).focus();
      await user.keyboard('{Enter}');
      const item = await screen.findByRole('menuitem', { name: /Mark all as read/ });
      expect(item.getAttribute('aria-disabled')).not.toBe('true');
   });

   it('filtro de tipo só oferece tipos presentes', async () => {
      const user = userEvent.setup();
      renderInbox();
      await user.click(screen.getByRole('button', { name: 'Add filter' }));
      await user.click(await screen.findByText('Notification type'));
      expect(await screen.findByText('Comment')).toBeTruthy();
      expect(screen.queryByText('Upload')).toBeNull();
   });
});
