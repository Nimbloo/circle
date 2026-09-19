// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore, type InboxNotification } from '@/store/notifications-store';

const api = vi.hoisted(() => ({
   remove: vi.fn(async () => ({})),
   page: vi.fn(async () => ({ items: [], nextCursor: null })),
   setRead: vi.fn(async () => ({})),
}));
vi.mock('@/lib/client', () => ({
   api: {
      inbox: {
         setRead: api.setRead,
         readAll: vi.fn(async () => ({})),
         remove: api.remove,
         page: api.page,
         snooze: vi.fn(async () => ({})),
      },
   },
}));
vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
   usePathname: () => '/nimbloo/inbox',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// O preview real (issue completa) não é o alvo aqui: um stub com o botão de voltar.
vi.mock('@/components/common/inbox/issue-preview', () => ({
   default: (p: { notification?: { id: string }; onBack?: () => void }) => (
      <div data-testid="preview">
         {p.notification?.id}
         {p.onBack && <button onClick={p.onBack}>Back to inbox</button>}
      </div>
   ),
}));

import Inbox from '@/components/common/inbox/inbox';

/** co#1/#2/#3/#10/#16 — teclado, filtro de lidas, excluir, carregar mais e mobile. */
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

for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
   if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { configurable: true, value: () => false });
   }
}

let width = 1400;
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
   Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => width });
});

beforeEach(() => {
   vi.clearAllMocks();
   width = 1400;
   useIssuesStore.setState({ issues: [] });
   useNotificationsStore.setState({
      notifications: [notif(3), notif(2), notif(1)],
      snoozed: [],
      selectedNotification: undefined,
      unreadCount: 3,
      loaded: true,
      loadError: false,
      hasMore: false,
      loadingMore: false,
   });
});

const renderInbox = () =>
   render(
      <SidebarProvider>
         <Inbox />
      </SidebarProvider>
   );
const press = (key: string) =>
   act(() => {
      fireEvent.keyDown(window, { key });
   });
const selected = () => useNotificationsStore.getState().selectedNotification?.id;

describe('inbox — teclado e lista', () => {
   it('j rola a linha selecionada para a vista (co#1)', () => {
      const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
      renderInbox();
      press('j');
      press('j');
      expect(selected()).toBe('n2');
      expect(spy).toHaveBeenLastCalledWith({ block: 'nearest' });
      const target = spy.mock.contexts.at(-1) as HTMLElement;
      expect(target.getAttribute('data-notification-id')).toBe('n2');
      spy.mockRestore();
   });

   it('Show read desligado: a aberta fica visível e j segue dela (co#2)', async () => {
      const user = userEvent.setup();
      renderInbox();
      screen.getByRole('button', { name: 'Display options' }).focus();
      await user.keyboard('{Enter}');
      await user.click(await screen.findByRole('switch', { name: 'Show read' }));
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      press('j'); // abre n3 (marca lida)
      expect(selected()).toBe('n3');
      expect(screen.getByText('Issue 3')).toBeTruthy();
      press('j');
      expect(selected()).toBe('n2');
   });

   it('linhas são focáveis e Enter abre (co#16)', () => {
      renderInbox();
      const row = document.querySelector('[data-notification-id="n1"]') as HTMLElement;
      expect(row.tabIndex).toBe(0);
      fireEvent.keyDown(row, { key: 'Enter' });
      expect(selected()).toBe('n1');
   });

   it('⌫ exclui a aberta e abre a seguinte (co#3)', async () => {
      renderInbox();
      press('j');
      expect(selected()).toBe('n3');
      press('Backspace');
      expect(selected()).toBe('n2');
      await waitFor(() => expect(api.remove).toHaveBeenCalledWith('n3'));
      await waitFor(() =>
         expect(useNotificationsStore.getState().notifications.map((n) => n.id)).toEqual([
            'n2',
            'n1',
         ])
      );
   });

   it('u alterna lida/não lida da aberta', () => {
      renderInbox();
      press('j');
      expect(useNotificationsStore.getState().notifications[0].read).toBe(true);
      press('u');
      expect(useNotificationsStore.getState().notifications[0].read).toBe(false);
   });

   it('"Load more" pede a página seguinte (co#3)', async () => {
      useNotificationsStore.setState({ hasMore: true });
      renderInbox();
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await waitFor(() =>
         expect(api.page).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'n1' }))
      );
   });
});

describe('inbox — mobile (co#10)', () => {
   it('abrir empilha no histórico e voltar retorna à lista', async () => {
      width = 390;
      const push = vi.spyOn(window.history, 'pushState');
      renderInbox();
      fireEvent.click(await screen.findByText('Issue 2'));
      expect(selected()).toBe('n2');
      expect(push).toHaveBeenCalled();
      expect(String(push.mock.calls[0][2])).toContain('n=n2');
      // Voltar do navegador (popstate sem o parâmetro) fecha o preview.
      act(() => {
         window.history.replaceState(null, '', '/nimbloo/inbox');
         window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(selected()).toBeUndefined();
      expect(screen.getByText('Issue 3')).toBeTruthy();
      push.mockRestore();
   });

   it('um cabeçalho só no detalhe: o voltar vai no header do preview', async () => {
      width = 390;
      useNotificationsStore.setState({ selectedNotification: notif(2) });
      renderInbox();
      expect(await screen.findByRole('button', { name: 'Back to inbox' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Inbox$/ })).toBeNull();
   });
});
