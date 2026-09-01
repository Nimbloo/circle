import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { sentryBaseOptions, scrubUrl } from '@/lib/sentry-options';

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

   it('mascara o token do magic link na URL, no transaction e nos breadcrumbs', () => {
      const url = 'https://circle.nimbloo.ai/invite/a0fb2866b9bab2edcafe1234567890ab';
      const out = scrub({
         request: { url },
         transaction: '/invite/a0fb2866b9bab2edcafe1234567890ab',
         breadcrumbs: [{ data: { from: '/login', to: url } }],
      } as unknown as ErrorEvent);

      expect(out?.request?.url).toBe('https://circle.nimbloo.ai/invite/[Filtered]');
      expect(out?.transaction).toBe('/invite/[Filtered]');
      expect(out?.breadcrumbs?.[0].data?.to).toBe('https://circle.nimbloo.ai/invite/[Filtered]');
      // O token nao pode sobrar em lugar nenhum do evento.
      expect(JSON.stringify(out)).not.toContain('a0fb2866');
   });

   it('scrubUrl nao estraga URL sem segredo', () => {
      expect(scrubUrl('https://circle.nimbloo.ai/CORE-12')).toBe(
         'https://circle.nimbloo.ai/CORE-12'
      );
   });

   it('não amostra erro (sampleRate 1.0) e não envia PII por padrão', () => {
      expect(sentryBaseOptions.sampleRate).toBe(1.0);
      expect(sentryBaseOptions.sendDefaultPii).toBe(false);
   });
});
