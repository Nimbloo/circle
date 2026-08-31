/**
 * Sentry no runtime Edge (middleware). Mesmo baseline do server — o módulo de
 * opções é puro justamente para poder ser carregado aqui.
 */
import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions, SENTRY_DSN } from '@/lib/sentry-options';

if (SENTRY_DSN) Sentry.init(sentryBaseOptions);
