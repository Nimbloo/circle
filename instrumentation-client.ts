/**
 * Sentry no browser. Em Next 15 este arquivo substitui o antigo
 * `sentry.client.config.ts` e roda antes da hidratação.
 */
import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions, SENTRY_DSN } from '@/lib/sentry-options';

if (SENTRY_DSN) Sentry.init(sentryBaseOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
