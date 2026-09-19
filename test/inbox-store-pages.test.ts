import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxNotification } from '@/store/notifications-store';
import type { NotificationDto } from '@/lib/api/notifications';

const api = vi.hoisted(() => ({
   list: vi.fn(),
   page: vi.fn(),
   remove: vi.fn(),
   snooze: vi.fn(async () => ({})),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: {
      inbox: {
         list: (...a: unknown[]) => api.list(...a),
         page: (...a: unknown[]) => api.page(...a),
         remove: (...a: unknown[]) => api.remove(...a),
         unreadCount: vi.fn(async () => ({ count: 0 })),
         setRead: vi.fn(async () => ({})),
         readAll: vi.fn(async () => ({})),
         snooze: (...a: unknown[]) => api.snooze(...(a as [])),
      },
   },
}));
vi.mock('sonner', () => ({ toast }));

import { INBOX_PAGE_SIZE, useNotificationsStore } from '@/store/notifications-store';
import { useIssuesStore } from '@/store/issues-store';

/** co#3/#13/#14 — carregar mais, excluir, Desfazer do adiamento e snooze remoto. */
const n = (i: number, over: Partial<InboxNotification> = {}): InboxNotification =>
   ({
      id: `n${String(i).padStart(3, '0')}`,
      read: false,
      sortAt: new Date(Date.UTC(2026, 8, 1) - i * 60_000).toISOString(),
      snoozedUntil: null,
      identifier: 'ENG-1',
      title: 'x',
      ...over,
   }) as unknown as InboxNotification;

const dto = (i: number): NotificationDto => ({
   id: `n${String(i).padStart(3, '0')}`,
   type: 'comment',
   content: '',
   read: false,
   snoozedUntil: null,
   createdAt: new Date(Date.UTC(2026, 8, 1) - i * 60_000).toISOString(),
   actor: null,
   issue: { id: 'i1', identifier: 'ENG-1', title: 'x' },
});

beforeEach(() => {
   vi.clearAllMocks();
   useIssuesStore.setState({ issues: [] });
   useNotificationsStore.setState({
      notifications: [n(1), n(2), n(3)],
      snoozed: [],
      selectedNotification: undefined,
      unreadCount: 3,
      loaded: true,
      loadError: false,
      hasMore: true,
      loadingMore: false,
   });
});

describe('carregar mais (co#3)', () => {
   it('pede a página seguinte a partir da última e anexa sem duplicar', async () => {
      api.page.mockResolvedValueOnce({ items: [dto(3), dto(4), dto(5)], nextCursor: null });
      await useNotificationsStore.getState().loadMore();
      expect(api.page).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'n003' }));
      const s = useNotificationsStore.getState();
      expect(s.notifications.map((x) => x.id)).toEqual(['n001', 'n002', 'n003', 'n004', 'n005']);
      expect(s.hasMore).toBe(false);
   });

   it('hidratação (evento) mantém as páginas já carregadas', async () => {
      const loaded = Array.from({ length: INBOX_PAGE_SIZE + 20 }, (_, i) => n(i + 1));
      useNotificationsStore.setState({ notifications: loaded, hasMore: true });
      // Nova no topo: a 1ª página desliza uma posição.
      api.list.mockResolvedValueOnce([
         dto(0),
         ...Array.from({ length: INBOX_PAGE_SIZE - 1 }, (_, i) => dto(i + 1)),
      ]);
      await useNotificationsStore.getState().hydrate();
      const ids = useNotificationsStore.getState().notifications.map((x) => x.id);
      expect(ids).toHaveLength(INBOX_PAGE_SIZE + 21);
      expect(ids[0]).toBe('n000');
      expect(new Set(ids).size).toBe(ids.length);
   });

   it('primeira página incompleta = não há mais', async () => {
      useNotificationsStore.setState({ notifications: [], hasMore: true });
      api.list.mockResolvedValueOnce([dto(1)]);
      await useNotificationsStore.getState().hydrate();
      expect(useNotificationsStore.getState().hasMore).toBe(false);
   });
});

describe('excluir notificação (co#3)', () => {
   it('otimista, com rollback na falha', async () => {
      let reject!: (e: unknown) => void;
      api.remove.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
      useNotificationsStore.setState({ selectedNotification: n(2) });
      const p = useNotificationsStore.getState().remove('n002');
      let s = useNotificationsStore.getState();
      expect(s.notifications.map((x) => x.id)).toEqual(['n001', 'n003']);
      expect(s.unreadCount).toBe(2);
      expect(s.selectedNotification).toBeUndefined();
      reject(new Error('boom'));
      await p.catch(() => {});
      s = useNotificationsStore.getState();
      expect(s.notifications.map((x) => x.id)).toEqual(['n001', 'n002', 'n003']);
      expect(s.unreadCount).toBe(3);
      expect(toast.error).toHaveBeenCalled();
   });

   it('evento deleted de outra aba tira da lista e do badge', () => {
      useNotificationsStore.getState().applyNotificationPatch({ id: 'n001', deleted: true });
      const s = useNotificationsStore.getState();
      expect(s.notifications.map((x) => x.id)).toEqual(['n002', 'n003']);
      expect(s.unreadCount).toBe(2);
      expect(api.list).not.toHaveBeenCalled();
   });
});

describe('adiar (co#13/#14)', () => {
   it('toast de sucesso oferece Desfazer', async () => {
      useNotificationsStore.getState().snooze('n001', 1);
      await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
      const opts = toast.success.mock.calls[0][1] as { action: { onClick: () => void } };
      opts.action.onClick();
      expect(useNotificationsStore.getState().notifications.map((x) => x.id)).toContain('n001');
      expect(api.snooze).toHaveBeenLastCalledWith('n001', null);
   });

   it('aceita um instante absoluto (Amanhã às 9h)', () => {
      const until = new Date(Date.now() + 20 * 3600_000).toISOString();
      useNotificationsStore.getState().snooze('n001', until);
      expect(api.snooze).toHaveBeenCalledWith('n001', until);
   });

   it('adiamento remoto da notificação aberta não esvazia o preview', () => {
      useNotificationsStore.setState({ selectedNotification: n(1) });
      const until = new Date(Date.now() + 3600_000).toISOString();
      useNotificationsStore.getState().applyNotificationPatch({ id: 'n001', snoozedUntil: until });
      const s = useNotificationsStore.getState();
      expect(s.notifications.map((x) => x.id)).not.toContain('n001');
      expect(s.selectedNotification?.id).toBe('n001');
   });
});
