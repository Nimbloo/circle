/**
 * Sentry no browser. Em Next 15 este arquivo substitui o antigo
 * `sentry.client.config.ts` e roda antes da hidratação.
 *
 * O import é DINÂMICO e condicionado ao DSN de propósito. `SENTRY_DSN` vem de
 * `NEXT_PUBLIC_SENTRY_DSN`, que o Next embute em tempo de BUILD — então, num build
 * sem DSN, `if (SENTRY_DSN)` é falso estaticamente e o bundler elimina o ramo
 * inteiro, junto com o SDK.
 *
 * Com o import estático anterior, o SDK entrava no bundle de TODA página mesmo
 * inerte: `Sentry.init` já era removido pela mesma eliminação de código morto, mas
 * o pacote continuava sendo carregado só para satisfazer o export
 * `onRouterTransitionStart` abaixo. Medido: ~290 kB (`@sentry/core`,
 * `@sentry/browser`, `browser-utils` e `conventions`) baixados por todo usuário
 * para um SDK que não fazia nada.
 *
 * A troca consciente: com DSN configurado, o SDK passa a carregar de forma
 * assíncrona, então um erro nos primeiros instantes da hidratação pode escapar.
 * Vale o custo — hoje o Sentry não captura nada (o projeto ainda não existe lá) e
 * o peso é pago por todo mundo, em toda visita. Se algum dia a captura desses
 * primeiros milissegundos importar mais que o peso, o caminho é voltar ao import
 * estático, e aí ele estará pagando por algo que funciona.
 */
import { SENTRY_DSN } from '@/lib/sentry-options';

type RouterTransitionStart = (href: string, navigationType: string) => void;

/** Preenchido quando (e se) o SDK terminar de carregar. */
let capturarTransicao: RouterTransitionStart | undefined;

if (SENTRY_DSN) {
   void (async () => {
      const [Sentry, { sentryBaseOptions }] = await Promise.all([
         import('@sentry/nextjs'),
         import('@/lib/sentry-options'),
      ]);
      Sentry.init(sentryBaseOptions);
      capturarTransicao = Sentry.captureRouterTransitionStart;
   })();
}

/**
 * O Next exige este export de forma síncrona, então ele é um encaminhador: antes do
 * SDK carregar (ou sem DSN) não faz nada, e depois delega.
 */
export const onRouterTransitionStart: RouterTransitionStart = (href, navigationType) => {
   capturarTransicao?.(href, navigationType);
};
