import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
vi.mock('@/lib/client', () => ({
   api: {
      inbox: {
         list: (...args: unknown[]) => list(...args),
         unreadCount: async () => ({ count: 0 }),
      },
   },
}));

import { useNotificationsStore } from '@/store/notifications-store';

/**
 * O inbox só pode dizer "vazio" depois da primeira hidratação — antes disso mostra
 * skeleton. Falha na hidratação também encerra a primeira carga (a lista atual é
 * mantida, como já era), senão a tela ficaria presa no skeleton.
 */
describe('notifications-store loaded', () => {
   beforeEach(() => {
      useNotificationsStore.setState({ notifications: [], loaded: false });
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
   });

   it('falha também encerra a primeira carga', async () => {
      list.mockRejectedValue(new Error('boom'));
      await useNotificationsStore.getState().hydrate();
      expect(useNotificationsStore.getState().loaded).toBe(true);
   });
});
