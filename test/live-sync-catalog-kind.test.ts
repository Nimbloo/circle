// @vitest-environment jsdom

import './setup-dom';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
   labels: { list: vi.fn() },
   emojis: { list: vi.fn() },
   me: vi.fn(),
}));
vi.mock('@/lib/client', () => ({ api }));

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
   open() {
      this.readyState = FakeEventSource.OPEN;
      this.onopen?.();
   }
   emit(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
   }
   close() {
      this.readyState = FakeEventSource.CLOSED;
   }
}

const { useLiveSync, CATALOG_CHANGED_EVENT, AUTOMATION_CHANGED_EVENT } = await import(
   '@/lib/use-live-sync'
);
const { useWorkspaceStore } = await import('@/store/workspace-store');
const emojisHook = await import('@/hooks/use-custom-emojis');

const hydrateWorkspace = vi.fn(async () => {});

function setup() {
   renderHook(() => useLiveSync());
   const es = FakeEventSource.instances.at(-1)!;
   es.open();
   return es;
}

beforeEach(() => {
   vi.clearAllMocks();
   FakeEventSource.instances = [];
   vi.stubGlobal('EventSource', FakeEventSource);
   useWorkspaceStore.setState({ hydrate: hydrateWorkspace, me: { id: 'me' } as never });
   emojisHook.invalidateCustomEmojis();
});
afterEach(() => {
   vi.useRealTimers();
   vi.unstubAllGlobals();
});

describe('catalog com kind não refaz o bootstrap (#53)', () => {
   it('template: só avisa a tela (CATALOG_CHANGED_EVENT com kind e teamId)', async () => {
      vi.useFakeTimers();
      const seen: unknown[] = [];
      const on = (e: Event) => seen.push((e as CustomEvent).detail);
      window.addEventListener(CATALOG_CHANGED_EVENT, on);
      const es = setup();
      es.emit({ entity: 'catalog', action: 'created', id: 't1', kind: 'template', teamId: 'CORE' });
      await vi.advanceTimersByTimeAsync(3000);
      window.removeEventListener(CATALOG_CHANGED_EVENT, on);
      expect(seen).toEqual([{ id: 't1', teamId: 'CORE', kind: 'template' }]);
      expect(hydrateWorkspace).not.toHaveBeenCalled();
   });

   it('sla: avisa a tela de workflows do time, sem bootstrap', async () => {
      vi.useFakeTimers();
      const seen: unknown[] = [];
      const on = (e: Event) => seen.push((e as CustomEvent).detail);
      window.addEventListener(AUTOMATION_CHANGED_EVENT, on);
      const es = setup();
      es.emit({ entity: 'catalog', action: 'updated', id: 'CORE:p1', kind: 'sla', teamId: 'CORE' });
      await vi.advanceTimersByTimeAsync(3000);
      window.removeEventListener(AUTOMATION_CHANGED_EVENT, on);
      expect(seen).toHaveLength(1);
      expect(hydrateWorkspace).not.toHaveBeenCalled();
   });

   it('sem kind (status): segue re-hidratando o workspace', async () => {
      vi.useFakeTimers();
      const es = setup();
      es.emit({ entity: 'catalog', action: 'updated', id: 's1' });
      await vi.advanceTimersByTimeAsync(3000);
      expect(hydrateWorkspace).toHaveBeenCalledTimes(1);
   });
});

describe('cache de emojis (#53)', () => {
   it('falha não fica cacheada: a próxima leitura tenta de novo', async () => {
      api.emojis.list.mockRejectedValueOnce(new Error('rede'));
      const a = renderHook(() => emojisHook.useCustomEmojis());
      await waitFor(() => expect(api.emojis.list).toHaveBeenCalledTimes(1));
      a.unmount();
      api.emojis.list.mockResolvedValueOnce([{ id: 'e1', shortcode: 'ok', url: 'u' }]);
      const b = renderHook(() => emojisHook.useCustomEmojis());
      await waitFor(() => expect(b.result.current).toHaveLength(1));
      expect(api.emojis.list).toHaveBeenCalledTimes(2);
   });

   it('evento catalog kind emoji invalida o cache e o hook montado recarrega', async () => {
      api.emojis.list.mockResolvedValueOnce([]);
      const h = renderHook(() => emojisHook.useCustomEmojis());
      await waitFor(() => expect(api.emojis.list).toHaveBeenCalledTimes(1));
      api.emojis.list.mockResolvedValueOnce([{ id: 'e1', shortcode: 'ok', url: 'u' }]);
      const es = setup();
      es.emit({ entity: 'catalog', action: 'created', id: 'e1', kind: 'emoji' });
      await waitFor(() => expect(h.result.current).toHaveLength(1));
      expect(emojisHook.customEmojiUrl(':ok:')).toBe('u');
      expect(hydrateWorkspace).not.toHaveBeenCalled();
   });
});
