// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/client';
import { errorReason } from '@/lib/error-reason';

/**
 * Auditoria de toasts (23/09): 502/504 do gateway chegam sem JSON e, em HTTP/2, com
 * `statusText` vazio — o `ApiError` saía com mensagem "" e o toast ficava vazio.
 */

afterEach(() => vi.unstubAllGlobals());

/** O erro rejeitado por `api.audit()` (a chamada sempre falha nestes testes). */
const failure = () =>
   api.audit().then(
      () => {
         throw new Error('esperava falha');
      },
      (e: unknown) => e as Error & { status: number }
   );

const respondRaw = (status: number, body: string, statusText = '') =>
   vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status, statusText }))
   );

describe('parseResponse — erro sem corpo legível', () => {
   it('502 sem JSON e sem statusText vira mensagem genérica com o status', async () => {
      respondRaw(502, '<html>Bad Gateway</html>');
      const err = await failure();
      expect(err.status).toBe(502);
      expect(err.message).toBe('Falha na requisição (HTTP 502)');
   });

   it('statusText presente continua sendo usado quando não há JSON', async () => {
      respondRaw(504, '', 'Gateway Timeout');
      const err = await failure();
      expect(err.message).toBe('Gateway Timeout');
   });

   it('ProblemDetail continua prevalecendo', async () => {
      respondRaw(400, JSON.stringify({ title: 'Bad Request', detail: 'Nome obrigatório' }));
      const err = await failure();
      expect(err.message).toBe('Nome obrigatório');
   });
});

describe('errorReason', () => {
   it('4xx mostra o motivo da API', () => {
      expect(errorReason({ status: 400, message: 'Ciclo de parent' }, 'Falha')).toBe(
         'Falha: Ciclo de parent'
      );
   });

   it('5xx com title cru prefere o fallback amigável', () => {
      expect(errorReason({ status: 500, message: 'Internal Server Error' }, 'Falha')).toBe('Falha');
   });

   it('erro de rede ("Failed to fetch") fica no fallback', () => {
      expect(errorReason(new TypeError('Failed to fetch'), 'Falha')).toBe('Falha');
   });
});
