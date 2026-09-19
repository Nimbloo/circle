import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxNotification } from '@/store/notifications-store';
import type { NotificationDto } from '@/lib/api/notifications';

const list = vi.fn();
const unreadCountApi = vi.fn(async () => ({ count: 0 }));
const setRead = vi.fn();
vi.mock('@/lib/client', () => ({
   api: {
      inbox: {
         list: (...args: unknown[]) => list(...args),
         unreadCount: () => unreadCountApi(),
         setRead: (...args: unknown[]) => setRead(...args),
         readAll: vi.fn(async () => ({})),
         snooze: vi.fn(async () => ({})),
      },
   },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useNotificationsStore } from '@/store/notifications-store';
import { useIssuesStore } from '@/store/issues-store';

/**
 * #19 — o evento da própria ação (e o de outra aba) chegava como "algo mudou" e o
 * store re-hidratava tudo, desfazendo o otimista pendente. Agora o evento traz
 * `{read, snoozedUntil}` e vira patch local; e notificação de issue fora do store é
 * mostrada a partir do `dto.issue` (antes era descartada — lista vazia com badge N).
 */
const n = (id: string, read = false): InboxNotification =>
   ({
      id,
      read,
      sortAt: '2026-09-01T00:00:00.000Z',
      snoozedUntil: null,
      identifier: 'ENG-1',
      title: 'x',
   }) as unknown as InboxNotification;

beforeEach(() => {
   vi.clearAllMocks();
   useNotificationsStore.setState({
      notifications: [n('a'), n('b')],
      snoozed: [],
      selectedNotification: undefined,
      unreadCount: 2,
      loaded: true,
      loadError: false,
   });
});

describe('applyNotificationPatch (#19)', () => {
   it('read vira patch local, sem hidratar', () => {
      useNotificationsStore
         .getState()
         .applyNotificationPatch({ id: 'a', read: true, recipientId: 'me' });
      const s = useNotificationsStore.getState();
      expect(s.notifications.find((x) => x.id === 'a')?.read).toBe(true);
      expect(s.unreadCount).toBe(1);
      expect(list).not.toHaveBeenCalled();
   });

   it('eco da própria ação não desfaz o otimista pendente', () => {
      setRead.mockReturnValue(new Promise(() => {}));
      useNotificationsStore.getState().markAsRead('a');
      useNotificationsStore.getState().applyNotificationPatch({ id: 'a', read: true });
      const s = useNotificationsStore.getState();
      expect(s.notifications.find((x) => x.id === 'a')?.read).toBe(true);
      expect(s.unreadCount).toBe(1);
      expect(list).not.toHaveBeenCalled();
   });

   it('snooze vigente tira da lista e do badge', () => {
      const until = new Date(Date.now() + 3600_000).toISOString();
      useNotificationsStore.getState().applyNotificationPatch({ id: 'b', snoozedUntil: until });
      const s = useNotificationsStore.getState();
      expect(s.notifications.map((x) => x.id)).toEqual(['a']);
      expect(s.unreadCount).toBe(1);
   });

   it('"all" marca todas como lidas e zera o badge', () => {
      useNotificationsStore.getState().applyNotificationPatch({ id: 'me', read: true, all: true });
      const s = useNotificationsStore.getState();
      expect(s.notifications.every((x) => x.read)).toBe(true);
      expect(s.unreadCount).toBe(0);
   });

   it('read de notificação fora da lista (capada) só reconsulta a contagem', async () => {
      unreadCountApi.mockResolvedValueOnce({ count: 7 });
      useNotificationsStore.getState().applyNotificationPatch({ id: 'zzz', read: false });
      await vi.waitFor(() => expect(useNotificationsStore.getState().unreadCount).toBe(7));
      expect(list).not.toHaveBeenCalled();
   });
});

describe('hydrate não depende do issues-store (#19)', () => {
   it('notificação de issue fora do store aparece a partir do dto.issue', async () => {
      useIssuesStore.setState({ issues: [] });
      const dto: NotificationDto = {
         id: 'n1',
         type: 'comment',
         content: 'Ana comentou',
         read: false,
         snoozedUntil: null,
         createdAt: '2026-09-18T00:00:00.000Z',
         actor: null,
         issue: { id: 'i9', identifier: 'OPS-9', title: 'Fora do store' },
      };
      list.mockResolvedValueOnce([dto]);
      unreadCountApi.mockResolvedValueOnce({ count: 1 });
      await useNotificationsStore.getState().hydrate();
      const [item] = useNotificationsStore.getState().notifications;
      expect(item?.identifier).toBe('OPS-9');
      expect(item?.title).toBe('Fora do store');
      expect(item?.user.name).toBeTruthy();
   });
});
