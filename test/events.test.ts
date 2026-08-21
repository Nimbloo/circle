import { describe, it, expect, vi } from 'vitest';
import { subscribe, publish, subscriberCount, type CircleEvent } from '@/lib/api/events';

describe('event bus in-memory', () => {
   it('entrega ao subscriber o que foi publicado (com ts carimbado)', () => {
      const received: CircleEvent[] = [];
      const unsub = subscribe((e) => received.push(e));

      publish({ entity: 'issue', action: 'created', id: 'i1', actorEmail: 'a@nimbloo.ai' });

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
         entity: 'issue',
         action: 'created',
         id: 'i1',
         actorEmail: 'a@nimbloo.ai',
      });
      expect(typeof received[0].ts).toBe('number');
      unsub();
   });

   it('ts é monotônico crescente entre publicações', () => {
      const seen: number[] = [];
      const unsub = subscribe((e) => seen.push(e.ts));
      publish({ entity: 'project', action: 'updated' });
      publish({ entity: 'project', action: 'updated' });
      expect(seen).toHaveLength(2);
      expect(seen[1]).toBeGreaterThan(seen[0]);
      unsub();
   });

   it('unsubscribe para de receber eventos', () => {
      const fn = vi.fn();
      const unsub = subscribe(fn);
      publish({ entity: 'label', action: 'created', id: 'l1' });
      expect(fn).toHaveBeenCalledTimes(1);
      unsub();
      publish({ entity: 'label', action: 'deleted', id: 'l1' });
      expect(fn).toHaveBeenCalledTimes(1); // não recebeu o segundo
   });

   it('publish não lança se um subscriber lança; os demais recebem', () => {
      const good = vi.fn();
      const unsubBad = subscribe(() => {
         throw new Error('subscriber quebrado');
      });
      const unsubGood = subscribe(good);

      expect(() => publish({ entity: 'comment', action: 'created', id: 'c1' })).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);

      unsubBad();
      unsubGood();
   });

   it('unsubscribe é idempotente e mantém a contagem consistente', () => {
      const base = subscriberCount();
      const unsub = subscribe(() => {});
      expect(subscriberCount()).toBe(base + 1);
      unsub();
      unsub(); // segunda chamada é no-op
      expect(subscriberCount()).toBe(base);
   });
});
