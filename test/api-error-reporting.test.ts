import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Observabilidade dos erros da API (auditoria v0.29.0): `handle()` converte toda
 * exceção em ProblemDetail antes de o `onRequestError` do Next enxergá-la, então
 * NENHUM 5xx chegava ao Sentry. Aqui provamos os dois lados do conserto:
 * o reporte explícito no `handle()` e a integração de console no runtime Node.
 */

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({
   captureException: (...args: unknown[]) => captureException(...args),
}));

import { handle } from '@/lib/api/http';
import { ApiError } from '@/lib/api/errors';

describe('erros da API → Sentry', () => {
   beforeEach(() => {
      captureException.mockClear();
      vi.spyOn(console, 'error').mockImplementation(() => {});
   });
   afterEach(() => vi.restoreAllMocks());

   it('5xx não tratado é capturado com método e rota como tags', async () => {
      const req = new Request('https://circle.test/api/v1/issues', { method: 'POST' });
      const boom = new Error('boom');
      const res = await handle(async () => {
         throw boom;
      }, req);

      expect(res.status).toBe(500);
      expect(captureException).toHaveBeenCalledTimes(1);
      const [err, ctx] = captureException.mock.calls[0] as [unknown, { tags: unknown }];
      expect(err).toBe(boom);
      expect(ctx.tags).toEqual({ http_method: 'POST', http_path: '/api/v1/issues' });
   });

   it('4xx (ApiError/Zod) NÃO vira evento — erro do cliente não é incidente', async () => {
      const res = await handle(async () => {
         throw new ApiError(403, 'Fora de escopo');
      });
      expect(res.status).toBe(403);
      expect(captureException).not.toHaveBeenCalled();
   });

   it('erro de SQLSTATE mapeado para 4xx também não vira evento', async () => {
      const res = await handle(async () => {
         throw Object.assign(new Error('fk'), { code: '23503' });
      });
      expect(res.status).toBe(404);
      expect(captureException).not.toHaveBeenCalled();
   });
});

describe('sentry.server.config — captura de console', () => {
   it('o runtime Node liga captureConsoleIntegration em nível error', async () => {
      const src = await import('node:fs').then((fs) =>
         fs.readFileSync('sentry.server.config.ts', 'utf8')
      );
      expect(src).toMatch(/captureConsoleIntegration\(\{\s*levels:\s*\['error'\]\s*\}\)/);
   });
});
