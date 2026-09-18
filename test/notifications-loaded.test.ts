import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxNotification } from '@/store/notifications-store';

const list = vi.fn();
const setRead = vi.fn();
const readAll = vi.fn();
const snoozeApi = vi.fn();
vi.mock('@/lib/client', () => ({
   api: {
      inbox: {
         list: (...args: unknown[]) => list(...args),
         unreadCount: async () => ({ count: 0 }),
         setRead: (...args: unknown[]) => setRead(...args),
         readAll: (...args: unknown[]) => readAll(...args),
         snooze: (...args: unknown[]) => snoozeApi(...args),
      },
   },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useNotificationsStore } from '@/store/notifications-store';

/**
 * O inbox só pode dizer "vazio" depois da primeira hidratação — antes disso mostra
 * skeleton. Falha na hidratação também encerra a primeira carga, mas sinaliza
 * `loadError` (a tela mostra erro com retry, não "vazio").
 */
describe('notifications-store loaded', () => {
   beforeEach(() => {
      useNotificationsStore.setState({ notifications: [], loaded: false, loadError: false });
      list.mockReset();
   });

   it('só fica loaded depois da primeira hidratação', async () => {
      let resolve!: (value: unknown[]) => void;
      list.mockReturnValue(new Promise((r) => (resolve = r)));
      const pending = useNotificationsStore.getState().hydrate();
      expect(useNotificationsStore.getState().loaded).toBe(false);
      resolve([]);
      await pending;
      expect(useNotificationsStore.getState().loaded).toBe(true);
      expect(useNotificationsStore.getState().loadError).toBe(false);
   });

   it('falha encerra a primeira carga e sinaliza loadError; retry com sucesso limpa', async () => {
      list.mockRejectedValueOnce(new Error('boom'));
      await useNotificationsStore.getState().hydrate();
      expect(useNotificationsStore.getState().loaded).toBe(true);
      expect(useNotificationsStore.getState().loadError).toBe(true);
      list.mockResolvedValueOnce([]);
      await useNotificationsStore.getState().hydrate();
      expect(useNotificationsStore.getState().loadError).toBe(false);
   });
});

const n = (id: string, read = false, sortAt = '2026-01-01T00:00:00.000Z') =>
   ({ id, read, sortAt }) as unknown as InboxNotification;

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Rollback direcionado (#15): falha de uma ação não apaga mudanças que chegaram no intervalo. */
describe('notifications-store rollback por item', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      useNotificationsStore.setState({
         notifications: [n('a'), n('b')],
         snoozed: [],
         selectedNotification: undefined,
         unreadCount: 2,
      });
   });

   /** Simula uma mudança remota (hidratação) em `b` durante o voo. */
   const remoteChangeOnB = () =>
      useNotificationsStore.setState((s) => ({
         notifications: s.notifications.map((x) => (x.id === 'b' ? { ...x, content: 'novo' } : x)),
      }));
   const b = () => useNotificationsStore.getState().notifications.find((x) => x.id === 'b');

   it('markAsRead', async () => {
      setRead.mockRejectedValueOnce(new Error('500'));
      useNotificationsStore.getState().markAsRead('a');
      remoteChangeOnB();
      await flush();
      const s = useNotificationsStore.getState();
      expect(s.notifications.find((x) => x.id === 'a')?.read).toBe(false);
      expect(s.unreadCount).toBe(2);
      expect(b()?.content).toBe('novo');
   });

   it('markAllAsRead', async () => {
      readAll.mockRejectedValueOnce(new Error('500'));
      useNotificationsStore.getState().markAllAsRead();
      remoteChangeOnB();
      await flush();
      const s = useNotificationsStore.getState();
      expect(s.notifications.map((x) => x.read)).toEqual([false, false]);
      expect(s.unreadCount).toBe(2);
      expect(b()?.content).toBe('novo');
   });

   it('snooze', async () => {
      snoozeApi.mockRejectedValueOnce(new Error('500'));
      useNotificationsStore.getState().snooze('a', 1);
      remoteChangeOnB();
      await flush();
      const s = useNotificationsStore.getState();
      expect(s.notifications.map((x) => x.id).sort()).toEqual(['a', 'b']);
      expect(s.unreadCount).toBe(2);
      expect(b()?.content).toBe('novo');
   });

   it('unsnooze', async () => {
      useNotificationsStore.setState({ snoozed: [n('s1'), n('s2')] });
      snoozeApi.mockRejectedValueOnce(new Error('500'));
      useNotificationsStore.getState().unsnooze('s1');
      useNotificationsStore.setState((s) => ({ snoozed: s.snoozed.filter((x) => x.id !== 's2') }));
      await flush();
      expect(useNotificationsStore.getState().snoozed.map((x) => x.id)).toEqual(['s1']);
   });
});
