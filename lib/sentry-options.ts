/**
 * Opções compartilhadas pelos três runtimes do Sentry (server, edge e browser).
 *
 * Puro de propósito — sem import de Node — para poder ser carregado também no bundle
 * Edge do middleware e no cliente. O `init` de cada runtime só acontece quando há DSN;
 * sem a variável o SDK fica inerte (dev e testes não emitem nada).
 */
import type { ErrorEvent } from '@sentry/nextjs';

/** DSN é público por design (identifica o projeto, não autentica). */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';

const ENVIRONMENT = process.env.NEXT_PUBLIC_CIRCLE_ENV ?? process.env.NODE_ENV ?? 'development';
const RELEASE = process.env.NEXT_PUBLIC_APP_VERSION
   ? `circle@${process.env.NEXT_PUBLIC_APP_VERSION}`
   : undefined;

/**
 * Chaves que nunca podem sair da aplicação. O domínio Nimbloo tem PII (e-mails,
 * dados de pessoas), então `sendDefaultPii` fica FALSE e este scrubber é a segunda
 * barreira, sobre o que o SDK ainda anexa (headers, extras, breadcrumbs).
 */
const SENSITIVE = /pass|senha|token|secret|authorization|cookie|session|api[-_]?key|dsn/i;

function scrub<T>(obj: T): T {
   if (!obj || typeof obj !== 'object') return obj;
   for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE.test(k)) (obj as Record<string, unknown>)[k] = '[Filtered]';
      else if (v && typeof v === 'object') scrub(v);
   }
   return obj;
}

/**
 * Segredos que viajam no PATH da URL, não em query string. `/invite/<token>` é o caso:
 * o token do magic link é a credencial inteira, e a URL vai no evento e nos spans de
 * tracing. Mascarar a chave não bastava — aqui o segredo é o próprio valor.
 */
const SECRET_PATHS: [RegExp, string][] = [[/\/invite\/[^/?#]+/gi, '/invite/[Filtered]']];

/** Aplica as máscaras de path a qualquer URL antes de sair da aplicação. */
export function scrubUrl(url: string): string {
   let out = url;
   for (const [re, replacement] of SECRET_PATHS) out = out.replace(re, replacement);
   return out;
}

function scrubEvent<T extends { request?: { url?: string }; transaction?: string }>(event: T): T {
   if (event.request?.url) event.request.url = scrubUrl(event.request.url);
   if (event.transaction) event.transaction = scrubUrl(event.transaction);
   return event;
}

function beforeSend(event: ErrorEvent): ErrorEvent | null {
   if (event.request?.headers) scrub(event.request.headers);
   if (event.request?.cookies) event.request.cookies = { cookies: '[Filtered]' };
   if (event.extra) scrub(event.extra);
   if (event.contexts) scrub(event.contexts);
   scrubEvent(event);
   // Breadcrumb de navegação carrega `from`/`to` com a URL crua.
   for (const b of event.breadcrumbs ?? []) {
      if (typeof b.data?.from === 'string') b.data.from = scrubUrl(b.data.from);
      if (typeof b.data?.to === 'string') b.data.to = scrubUrl(b.data.to);
      if (typeof b.data?.url === 'string') b.data.url = scrubUrl(b.data.url);
   }
   return event;
}

/** Spans de tracing carregam a mesma URL — o `beforeSend` não os cobre. */
function beforeSendTransaction<T extends { request?: { url?: string }; transaction?: string }>(
   event: T
): T {
   return scrubEvent(event);
}

/**
 * Erro NUNCA é amostrado (`sampleRate: 1.0`) — amostragem só vale para tracing,
 * onde o volume é a preocupação.
 */
export const sentryBaseOptions = {
   dsn: SENTRY_DSN,
   environment: ENVIRONMENT,
   release: RELEASE,
   sampleRate: 1.0,
   tracesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,
   sendDefaultPii: false,
   maxBreadcrumbs: 200,
   beforeSend,
   beforeSendTransaction,
   /** Ruído não acionável: cliente que desconecta, rota inexistente varrida por bot. */
   ignoreErrors: [
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
      'AbortError',
      'ResizeObserver loop limit exceeded',
   ] as (string | RegExp)[],
};
