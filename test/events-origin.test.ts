import { afterEach, describe, expect, it, vi } from 'vitest';

const onCircleEvent = vi.hoisted(() => vi.fn(async () => {}));
const execute = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/api/webhooks', () => ({ onCircleEvent }));
vi.mock('@/db', () => ({ db: { execute } }));

const { publish, publishInternal, subscribe, runWithEventOrigin, CLIENT_ID_HEADER } = await import(
   '@/lib/api/events'
);
type CircleEvent = import('@/lib/api/events').CircleEvent;

afterEach(() => {
   vi.unstubAllEnvs();
   vi.clearAllMocks();
});

describe('publishInternal — canal SSE-only (sem webhooks)', () => {
   it('entrega localmente como o publish', () => {
      const seen: CircleEvent[] = [];
      const unsub = subscribe((e) => seen.push(e));
      publishInternal({ entity: 'issue', action: 'updated', teamId: 'ENG' });
      unsub();
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ entity: 'issue', action: 'updated', teamId: 'ENG' });
      expect(typeof seen[0].ts).toBe('number');
   });

   it('em runtime real faz pg_notify, mas NÃO despacha webhook (o publish despacha)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DATABASE_URL', 'postgres://fake');
      publishInternal({ entity: 'issue', action: 'updated', teamId: 'ENG' });
      await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 10));
      expect(onCircleEvent).not.toHaveBeenCalled();

      publish({ entity: 'issue', action: 'updated', id: 'i1', teamId: 'ENG' });
      await vi.waitFor(() => expect(onCircleEvent).toHaveBeenCalledTimes(1), { timeout: 15000 });
   });
});

describe('clientId — origem do evento (aba que fez a mutação)', () => {
   it('evento publicado dentro de runWithEventOrigin carrega o clientId da aba', async () => {
      const seen: CircleEvent[] = [];
      const unsub = subscribe((e) => seen.push(e));
      await runWithEventOrigin('tab-0001', async () => {
         await Promise.resolve();
         publish({ entity: 'issue', action: 'updated', id: 'i1' });
      });
      publish({ entity: 'issue', action: 'updated', id: 'i2' });
      unsub();
      expect(seen[0].clientId).toBe('tab-0001');
      expect(seen[1].clientId).toBeUndefined();
   });

   it('clientId malformado é descartado', async () => {
      const seen: CircleEvent[] = [];
      const unsub = subscribe((e) => seen.push(e));
      await runWithEventOrigin('x'.repeat(200), async () => {
         publish({ entity: 'issue', action: 'updated', id: 'i1' });
      });
      await runWithEventOrigin('<script>', async () => {
         publish({ entity: 'issue', action: 'updated', id: 'i1' });
      });
      unsub();
      expect(seen.map((e) => e.clientId)).toEqual([undefined, undefined]);
   });

   it('expõe o nome do header usado pelo cliente', () => {
      expect(CLIENT_ID_HEADER).toBe('x-circle-client-id');
   });
});

describe('handle() propaga o header da aba para os eventos da request', () => {
   it('publish dentro do handler sai com o clientId do header', async () => {
      const { handle } = await import('@/lib/api/http');
      const seen: CircleEvent[] = [];
      const unsub = subscribe((e) => seen.push(e));
      const req = new Request('http://x/api/v1/issues/i1', {
         method: 'PATCH',
         headers: { [CLIENT_ID_HEADER]: 'tab-abcdef12' },
      });
      await handle(async () => {
         publish({ entity: 'issue', action: 'updated', id: 'i1' });
         return new Response('{}', { headers: { 'content-type': 'application/json' } });
      }, req);
      unsub();
      expect(seen[0].clientId).toBe('tab-abcdef12');
   });
});
