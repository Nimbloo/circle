import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { sentryBaseOptions } from '@/lib/sentry-options';

/**
 * O domínio Nimbloo carrega PII, então nenhum evento pode sair com credencial ou
 * cookie anexado. `sendDefaultPii` já é false; este é o segundo filtro, sobre o que
 * o SDK ainda coleta sozinho (headers, extras, contextos).
 */
const scrub = (event: ErrorEvent) => sentryBaseOptions.beforeSend(event);

describe('scrubber do Sentry', () => {
   it('mascara credenciais em headers, sem apagar os campos inocentes', () => {
      const out = scrub({
         request: {
            headers: {
               'authorization': 'Bearer supersecreto',
               'x-api-key': 'chave',
               'content-type': 'application/json',
            },
         },
      } as unknown as ErrorEvent);

      expect(out?.request?.headers).toEqual({
         'authorization': '[Filtered]',
         'x-api-key': '[Filtered]',
         'content-type': 'application/json',
      });
   });

   it('remove os cookies inteiros (carregam a sessão)', () => {
      const out = scrub({
         request: { cookies: { 'authjs.session-token': 'jwt' } },
      } as unknown as ErrorEvent);
      expect(out?.request?.cookies).toEqual({ cookies: '[Filtered]' });
   });

   it('desce em objetos aninhados de extra/contexts', () => {
      const out = scrub({
         extra: { payload: { senha: '123', nome: 'Ana' } },
      } as unknown as ErrorEvent);

      expect(out?.extra).toEqual({ payload: { senha: '[Filtered]', nome: 'Ana' } });
   });

   it('não amostra erro (sampleRate 1.0) e não envia PII por padrão', () => {
      expect(sentryBaseOptions.sampleRate).toBe(1.0);
      expect(sentryBaseOptions.sendDefaultPii).toBe(false);
   });
});
