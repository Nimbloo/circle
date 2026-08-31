/**
 * Sentry no runtime Node (rotas /api, server components, jobs do boot).
 * Carregado pelo `register()` de `instrumentation.ts`.
 */
import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions, SENTRY_DSN } from '@/lib/sentry-options';

if (SENTRY_DSN) Sentry.init(sentryBaseOptions);
