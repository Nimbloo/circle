/**
 * Log estruturado das rotas de API.
 *
 * O Fluent Bit já coleta o stdout do pod e joga no Loki; o que faltava era o log ter
 * CAMPOS. Texto solto (`[circle-api] GET /x erro`) não se consulta: não dá para pedir
 * "as requisições acima de 1 s", nem seguir uma requisição específica entre linhas.
 *
 * Cada linha é um JSON de uma linha só, com chaves em camelCase — a convenção da casa
 * (traceId/requestId/route), a mesma que os serviços Java emitem via MDC.
 *
 * `requestId` vem do header `x-request-id` quando ele chega, senão nasce aqui, e volta
 * na resposta: quando alguém relatar lentidão ou erro, o id do cabeçalho leva direto à
 * linha do log.
 *
 * Em produção quem manda esse header é o **Istio**, não o browser — verificado em prd:
 * um `x-request-id` enviado de fora é substituído pelo do Envoy antes de chegar aqui.
 * É o comportamento bom: o id do log da aplicação passa a ser o MESMO do access log da
 * malha, então as duas pontas se cruzam.
 */
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';

export const REQUEST_ID_HEADER = 'x-request-id';

type Level = 'info' | 'warn' | 'error';

export interface RequestLogFields {
   requestId: string;
   method: string;
   route: string;
   status: number;
   durationMs: number;
   /** Id do trace do Sentry, quando há span ativo — liga a linha ao evento de erro. */
   traceId?: string;
}

/** Id da requisição: o que veio do chamador, ou um novo. */
export function requestIdFrom(req?: Request): string {
   const fromHeader = req?.headers.get(REQUEST_ID_HEADER)?.trim();
   // Limita o que entra no log: um header hostil não vira linha gigante nem quebra o JSON.
   if (fromHeader && fromHeader.length <= 64 && /^[\w.:-]+$/.test(fromHeader)) return fromHeader;
   return randomUUID();
}

/**
 * `traceId` do span ativo do Sentry, quando existe. Import ESTÁTICO de propósito: o SDK
 * já está no grafo das rotas (via `observe-error`), e um import dinâmico aqui rodava a
 * inicialização do módulo DENTRO da primeira requisição — o guarda de uploads, que prova
 * que requisição recusada não aloca Buffer, flagrou exatamente isso.
 */
export function currentTraceId(): string | undefined {
   try {
      const span = Sentry.getActiveSpan?.();
      if (!span) return undefined;
      const id = Sentry.spanToJSON(span).trace_id;
      return typeof id === 'string' ? id : undefined;
   } catch {
      return undefined;
   }
}

function emit(level: Level, payload: Record<string, unknown>): void {
   const ts = new Date().toISOString();
   // O TIMESTAMP NA FRENTE NÃO É ENFEITE. O Fluent Bit do cluster corta tudo até o
   // primeiro espaço da linha (`^[^ ]+%s+(.*)`), assumindo que toda linha começa com
   // timestamp — que é como os serviços Java logam. Sem o prefixo, a linha JSON era
   // cortada no primeiro espaço DE DENTRO do JSON e chegava ao Loki como `{}`:
   // 72 linhas vazias em 24h, medidas no Loki. O log parecia certo no `kubectl logs`
   // e estava destruído no destino.
   const line = `${ts} ${JSON.stringify({ level, ts, ...payload })}`;
   if (level === 'error') console.error(line);
   else if (level === 'warn') console.warn(line);
   else console.log(line);
}

/**
 * Uma linha por requisição concluída — o `<< METHOD /rota - STATUS (Xms)` da convenção,
 * só que com campos. Rápida sai em `info`; a partir de 1 s sai em `warn`, para a
 * lentidão aparecer no log sem depender de dashboard; 5xx sai em `error`.
 */
export function logRequest(fields: RequestLogFields): void {
   const level: Level =
      fields.status >= 500 ? 'error' : fields.durationMs >= 1000 ? 'warn' : 'info';
   emit(level, { msg: `<< ${fields.method} ${fields.route}`, ...fields });
}

/** Erro de rota, com o mesmo `requestId` da linha de requisição para casar as duas. */
export function logError(
   msg: string,
   err: unknown,
   ctx: { requestId: string; method?: string; route?: string }
): void {
   // Corta a mensagem e o stack: uma exceção com payload grande viraria uma linha de log
   // gigante, e linha gigante é linha que o Loki descarta. O evento completo está no
   // Sentry; aqui o que importa é o rastro.
   const corta = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);
   const detalhe =
      err instanceof Error
         ? {
              error: corta(`${err.name}: ${err.message}`, 500),
              stack: err.stack ? corta(err.stack, 2000) : undefined,
           }
         : { error: corta(String(err), 500) };
   emit('error', { msg, ...ctx, ...detalhe });
}
