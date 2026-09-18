import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { runListener, type ListenClient } from '@/lib/api/events';

/**
 * Conexão LISTEN entre pods (#6, servidor): precisa de keepalive (senão uma conexão
 * meio-aberta fica muda para sempre) e, ao reconectar, avisar os subscribers locais
 * para re-sincronizar — os NOTIFY do intervalo se perderam.
 */
class FakeClient extends EventEmitter implements ListenClient {
   queries: string[] = [];
   hangPing = false;
   ended = false;
   async connect(): Promise<void> {}
   async query(sql: string): Promise<unknown> {
      this.queries.push(sql);
      if (sql === 'select 1' && this.hangPing) return new Promise(() => {});
      return {};
   }
   async end(): Promise<void> {
      this.ended = true;
   }
}

afterEach(() => vi.useRealTimers());

describe('listener LISTEN/NOTIFY', () => {
   it('pinga periodicamente e reconecta quando o ping trava; ao voltar, emite resync', async () => {
      vi.useFakeTimers();
      const clients: FakeClient[] = [];
      const onResync = vi.fn();
      const stop = runListener({
         makeClient: () => {
            const c = new FakeClient();
            clients.push(c);
            return c;
         },
         onEvent: () => {},
         onResync,
         pingMs: 1000,
         reconnectMs: 500,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(clients).toHaveLength(1);
      expect(clients[0].queries).toContain('LISTEN circle_events');
      expect(onResync).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(clients[0].queries).toContain('select 1');

      // Conexão meio-aberta: o ping nunca volta.
      clients[0].hangPing = true;
      await vi.advanceTimersByTimeAsync(1000); // dispara o ping que trava
      await vi.advanceTimersByTimeAsync(1000); // estoura o timeout do ping
      await vi.advanceTimersByTimeAsync(500); // backoff da reconexão
      expect(clients[0].ended).toBe(true);
      expect(clients).toHaveLength(2);
      expect(onResync).toHaveBeenCalledTimes(1);
      stop();
   });

   it('erro da conexão reconecta e emite resync; erro tardio não derruba o processo', async () => {
      vi.useFakeTimers();
      const clients: FakeClient[] = [];
      const onResync = vi.fn();
      const stop = runListener({
         makeClient: () => {
            const c = new FakeClient();
            clients.push(c);
            return c;
         },
         onEvent: () => {},
         onResync,
         pingMs: 10_000,
         reconnectMs: 100,
      });
      await vi.advanceTimersByTimeAsync(0);
      clients[0].emit('error', new Error('conexão caiu'));
      // Um 'error' depois do descarte não pode virar exceção não tratada.
      expect(() => clients[0].emit('error', new Error('tardio'))).not.toThrow();
      await vi.advanceTimersByTimeAsync(100);
      expect(clients).toHaveLength(2);
      expect(onResync).toHaveBeenCalledTimes(1);
      stop();
   });

   it('entrega as notificações recebidas', async () => {
      const onEvent = vi.fn();
      const client = new FakeClient();
      const stop = runListener({
         makeClient: () => client,
         onEvent,
         onResync: () => {},
      });
      await Promise.resolve();
      await Promise.resolve();
      client.emit('notification', {
         payload: JSON.stringify({ entity: 'issue', action: 'updated', ts: 1 }),
      });
      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ entity: 'issue' }));
      stop();
   });
});
