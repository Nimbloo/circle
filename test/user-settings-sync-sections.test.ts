// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const get = vi.fn<() => Promise<Record<string, unknown>>>();
const patch = vi.fn<(data: Record<string, unknown>) => Promise<Record<string, unknown>>>();
const put = vi.fn();

vi.mock('@/lib/client', () => ({
   api: {
      settings: {
         get: () => get(),
         patch: (data: Record<string, unknown>) => patch(data),
         put: (data: unknown) => put(data),
      },
   },
}));

const { startUserSettingsSync, getSettingsSyncError } = await import('@/lib/user-settings-sync');
const { usePreferencesStore } = await import('@/store/preferences-store');
const { useNotificationPrefsStore } = await import('@/store/notification-prefs-store');

/**
 * #15 — GET falho deixava `ready=true` e o 1º toggle PUTava o blob local por cima das
 * settings do servidor. Agora: sem GET bem-sucedido não há gravação (e o erro fica
 * exposto); gravação manda SÓ a seção alterada (PATCH), nunca o blob inteiro.
 */
describe('user-settings-sync por seção (#15)', () => {
   beforeAll(() => vi.useFakeTimers());
   afterAll(() => vi.useRealTimers());

   it('GET falho: nada é gravado e o erro fica exposto', async () => {
      get.mockRejectedValueOnce(new Error('503'));
      await startUserSettingsSync();
      expect(getSettingsSyncError()).toBe('load');

      usePreferencesStore.getState().setPref('fontSize', 'Large');
      await vi.advanceTimersByTimeAsync(1000);
      expect(patch).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
   });

   it('retentativa do GET liga a gravação; só a seção alterada vai no PATCH', async () => {
      get.mockResolvedValueOnce({ preferences: { fontSize: 'Small' } });
      patch.mockResolvedValue({});
      await vi.advanceTimersByTimeAsync(60_000);
      expect(get).toHaveBeenCalledTimes(2);
      expect(getSettingsSyncError()).toBeNull();
      expect(usePreferencesStore.getState().fontSize).toBe('Small');

      useNotificationPrefsStore.getState().hydratePrefs({ marketing: true });
      await vi.advanceTimersByTimeAsync(1000);
      expect(patch).toHaveBeenCalledTimes(1);
      expect(Object.keys(patch.mock.calls[0][0])).toEqual(['notifications']);
      expect(put).not.toHaveBeenCalled();
   });

   it('falha ao gravar fica exposta e a seção é reenviada', async () => {
      patch.mockRejectedValueOnce(new Error('500')).mockResolvedValue({});
      usePreferencesStore.getState().setPref('fontSize', 'Large');
      await vi.advanceTimersByTimeAsync(1000);
      expect(getSettingsSyncError()).toBe('save');
      await vi.advanceTimersByTimeAsync(10_000);
      const last = patch.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(Object.keys(last)).toEqual(['preferences']);
      expect(getSettingsSyncError()).toBeNull();
   });
});
