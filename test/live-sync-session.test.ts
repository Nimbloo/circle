// @vitest-environment jsdom

import './setup-dom';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('@/lib/client', () => ({ api }));

/** EventSource falso: `fail()` = o servidor respondeu não-200 (ex.: 401) e fechou. */
class FakeEventSource {
   static CONNECTING = 0;
   static OPEN = 1;
   static CLOSED = 2;
   static instances: FakeEventSource[] = [];
   readyState = FakeEventSource.CONNECTING;
   onopen: (() => void) | null = null;
   onmessage: ((ev: MessageEvent<string>) => void) | null = null;
   onerror: (() => void) | null = null;
   constructor(public url: string) {
      FakeEventSource.instances.push(this);
   }
   fail() {
      this.readyState = FakeEventSource.CLOSED;
      this.onerror?.();
   }
   close() {
      this.readyState = FakeEventSource.CLOSED;
   }
}

const { useLiveSync } = await import('@/lib/use-live-sync');
const { __setSessionRedirectForTest, endSession } = await import('@/lib/session-redirect');

/**
 * #12 — com a sessão expirada o stream respondia 401 e o cliente reconectava para
 * sempre. Antes de reconectar ele sonda `/me`; se a sessão acabou, desiste.
 */
beforeEach(() => {
   vi.useFakeTimers();
   FakeEventSource.instances = [];
   vi.stubGlobal('EventSource', FakeEventSource);
   __setSessionRedirectForTest(() => {});
});
afterEach(() => {
   vi.useRealTimers();
   vi.unstubAllGlobals();
   __setSessionRedirectForTest(null);
});

describe('live-sync e sessão expirada (#12)', () => {
   it('401 na sonda encerra: não abre outro stream', async () => {
      api.me.mockImplementation(async () => {
         endSession('/login'); // o parse do cliente faz isto no 401
         throw new Error('401');
      });
      renderHook(() => useLiveSync());
      FakeEventSource.instances[0].fail();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(api.me).toHaveBeenCalledTimes(1);
      expect(FakeEventSource.instances).toHaveLength(1);
   });

   it('queda com sessão válida reconecta', async () => {
      api.me.mockResolvedValue({ id: 'me' });
      renderHook(() => useLiveSync());
      FakeEventSource.instances[0].fail();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(FakeEventSource.instances).toHaveLength(2);
   });
});
