import { registerOTel } from '@vercel/otel';
import { SamplingDecision, type Sampler, type SamplingResult } from '@opentelemetry/sdk-trace-base';

/**
 * Probes do K8s (`/api/healthz`, `/api/readyz`) — o kubelet bate neles a cada poucos
 * segundos e não têm valor de diagnóstico num trace. Excluídos ANTES da exportação
 * (sampler), não filtrados depois.
 *
 * O Next.js nomeia os spans HTTP já com o path resolvido (`next/dist/server/base-server.js`
 * e `.../route-modules/app-route/module.js`): o span raiz nasce como `"${method} ${req.url}"`
 * e o span do handler como `"executing api route (app) ${route}"` — os dois já carregam
 * "/api/healthz"/"/api/readyz" no nome desde a criação do span, então o sampler decide sem
 * precisar de atributos que só chegam depois (`next.route` só é setado perto do fim do
 * span raiz, tarde demais para influenciar a amostragem).
 */
const IGNORED_PATH_PATTERN = /\/api\/(healthz|readyz)\b/;

const RECORD_AND_SAMPLE: SamplingResult = { decision: SamplingDecision.RECORD_AND_SAMPLED };
const DO_NOT_RECORD: SamplingResult = { decision: SamplingDecision.NOT_RECORD };

const ignoreHealthProbes: Sampler = {
   shouldSample: (_context, _traceId, spanName) =>
      IGNORED_PATH_PATTERN.test(spanName) ? DO_NOT_RECORD : RECORD_AND_SAMPLE,
   toString: () => 'IgnoreHealthProbesSampler',
};

/**
 * Traces do servidor Next.js (App Router, route handlers) via OpenTelemetry, exportados
 * OTLP/HTTP para o Grafana Tempo.
 *
 * INERTE por padrão: `@vercel/otel` só liga um exporter real quando as envs padrão do
 * OTel (`OTEL_EXPORTER_OTLP_ENDPOINT` ou `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) existem —
 * sem elas, `registerOTel` nem é chamado: zero instrumentação, zero overhead, zero erro.
 * A env chega pelo chart (nimbloo-k8s), fora deste repo.
 *
 * `service.name=circle` e o propagador W3C Trace Context (`traceparent`) são o default
 * do pacote — não precisam de configuração extra.
 *
 * Precisa registrar ANTES do `Sentry.init()` (ver `instrumentation.ts`): o OTel só permite
 * um TracerProvider global, e quem registra primeiro vence — se o Sentry vencesse, nosso
 * exporter OTLP nunca entraria no pipeline e nada chegaria ao Tempo. O Sentry perde, nesse
 * cenário, apenas a própria captura de performance (transactions); a captura de erro
 * (`captureException`/`captureConsoleIntegration`) é um caminho independente do tracer e
 * continua funcionando normalmente.
 */
export function registerTracing(): void {
   const endpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
   if (!endpoint) return;

   registerOTel({
      serviceName: 'circle',
      traceSampler: ignoreHealthProbes,
   });
}
