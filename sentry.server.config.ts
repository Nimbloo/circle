/**
 * Sentry no runtime Node (rotas /api, server components, jobs do boot).
 * Carregado pelo `register()` de `instrumentation.ts`.
 */
import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions, SENTRY_DSN } from '@/lib/sentry-options';

/**
 * `captureConsoleIntegration` é a rede que faltava: o `handle()` de `lib/api/http.ts`
 * traduz TODA exceção em ProblemDetail antes de o `onRequestError` do Next enxergá-la,
 * então nenhum erro da API chegava ao Sentry. Como todo 5xx passa por um
 * `console.error` antes de responder, capturar o console do servidor traz o erro de
 * volta mesmo quando um caminho novo esquecer de reportar explicitamente.
 *
 * Só no runtime Node de propósito: no browser o React usa `console.error` para
 * warnings de desenvolvimento e a integração viraria ruído.
 */
if (SENTRY_DSN)
   Sentry.init({
      ...sentryBaseOptions,
      integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
   });
