import * as Sentry from '@sentry/nextjs';

/**
 * Reporte explícito dos 5xx da API ao Sentry.
 *
 * Por que existe: `handle()` (lib/api/http.ts) converte qualquer exceção em
 * ProblemDetail **antes** de o `onRequestError` do Next.js poder vê-la — resultado
 * medido na auditoria da v0.29.0: zero erros de API no Sentry. A
 * `captureConsoleIntegration` (ver `sentry.server.config.ts`) é a rede de segurança;
 * esta função é o caminho explícito, que preserva a exceção original (stack e
 * agrupamento corretos) e anexa método/rota como tags pesquisáveis.
 *
 * Só 5xx: 4xx é erro do cliente, não incidente. Nunca lança — observabilidade não
 * pode derrubar a resposta.
 */
export function captureServerError(err: unknown, req?: Request): void {
   try {
      const tags: Record<string, string> = {};
      if (req) {
         tags.http_method = req.method;
         try {
            tags.http_path = new URL(req.url).pathname;
         } catch {
            /* URL relativa em teste: sem tag de rota */
         }
      }
      Sentry.captureException(err, { tags });
   } catch {
      /* Sentry inerte (sem DSN) ou falha de transporte: segue o jogo */
   }
}
