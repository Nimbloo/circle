import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { handle } from '@/lib/api/http';
import { routePattern } from '@/lib/metrics';
import { ok } from '@/lib/api/response';

/**
 * O Next comprime HTML e assets, mas NÃO o que sai de um route handler — medido no
 * build de produção (`/login` volta com `content-encoding: gzip`; `/api/metrics`, 8 KB,
 * volta cru). Sem esta camada, o hydrate do board mandava 2.283 KB de JSON sem
 * compressão; com ela, 106 KB.
 *
 * Este teste trava o comportamento: se alguém remover a compressão, ou passar a
 * comprimir o que não deve (binário, stream), a suíte acusa.
 */
const big = { data: Array.from({ length: 400 }, (_, i) => ({ id: i, nome: `item ${i}` })) };

const req = (accept?: string) =>
   new Request('http://x/api/v1/coisas', accept ? { headers: { 'accept-encoding': accept } } : {});

describe('compressão das respostas de API', () => {
   it('comprime JSON grande quando o cliente aceita gzip, e o corpo continua íntegro', async () => {
      const res = await handle(async () => ok(big.data), req('gzip, deflate, br'));

      expect(res.headers.get('content-encoding')).toBe('gzip');
      expect(res.headers.get('vary')).toContain('accept-encoding');

      const compressed = Buffer.from(await res.arrayBuffer());
      const original = Buffer.from(JSON.stringify({ data: big.data }));
      expect(compressed.byteLength).toBeLessThan(original.byteLength / 5); // ~20x na prática
      expect(Number(res.headers.get('content-length'))).toBe(compressed.byteLength);
      expect(JSON.parse(gunzipSync(compressed).toString())).toEqual({ data: big.data });
   });

   it('não comprime quando o cliente não pede', async () => {
      const res = await handle(async () => ok(big.data), req('identity'));
      expect(res.headers.get('content-encoding')).toBeNull();
      expect(JSON.parse(await res.text())).toEqual({ data: big.data });
   });

   it('não comprime corpo pequeno (o cabeçalho custaria mais que a economia)', async () => {
      const res = await handle(async () => ok({ ok: true }), req('gzip'));
      expect(res.headers.get('content-encoding')).toBeNull();
      expect(await res.json()).toEqual({ data: { ok: true } });
   });

   it('não toca em resposta que não é JSON', async () => {
      const csv = 'a,b\n'.repeat(500);
      const res = await handle(
         async () => new Response(csv, { headers: { 'content-type': 'text/csv' } }),
         req('gzip')
      );
      expect(res.headers.get('content-encoding')).toBeNull();
      expect(await res.text()).toBe(csv);
   });

   it('comprime também o corpo de erro (problem+json), que pode ser grande', async () => {
      const detail = 'x'.repeat(4000);
      const res = await handle(async () => {
         throw new Error(detail);
      }, req('gzip'));
      expect(res.status).toBe(500);
      // 500 genérico não vaza a mensagem; o que importa aqui é o caminho não quebrar.
      expect(res.headers.get('content-type')).toContain('problem+json');
   });
});

/**
 * O rótulo `route` da métrica só é seguro enquanto o conjunto de valores for fechado.
 * Este teste é a trava: se um identificador passar cru, vira uma série por issue.
 */
describe('padrão de rota nas métricas', () => {
   it('troca identificadores por :id e preserva o resto', () => {
      expect(routePattern('http://x/api/v1/issues')).toBe('/api/v1/issues');
      expect(routePattern('http://x/api/v1/issues/3f2a1b4c-9d8e-4f21-b7c6-1a2b3c4d5e6f')).toBe(
         '/api/v1/issues/:id'
      );
      expect(routePattern('http://x/api/v1/issues/CORE-123/activity')).toBe(
         '/api/v1/issues/:id/activity'
      );
      expect(routePattern('http://x/api/v1/teams/CORE/members')).toBe('/api/v1/teams/CORE/members');
      expect(routePattern('http://x/api/v1/workspace?rollover=true')).toBe('/api/v1/workspace');
      expect(routePattern(undefined)).toBe('unknown');
   });
});
