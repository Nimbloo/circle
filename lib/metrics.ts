import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

/**
 * Métricas Prometheus do Circle (Node runtime). Expostas em `/api/metrics`, raspadas
 * pelo Prometheus/Thanos do barramento Nimbloo (ver ServiceMonitor no chart). Rótulos
 * de baixa cardinalidade (method+status) — RED do entrypoint sem explodir séries; rota
 * fica de fora de propósito (segmentos dinâmicos como /issues/[id] estourariam label).
 * Singleton por processo (globalThis) — sobrevive ao hot-reload do dev sem re-registrar.
 */
interface CircleMetrics {
   registry: Registry;
   httpRequests: Counter<'method' | 'status'>;
   httpDuration: Histogram<'method' | 'status'>;
}

const g = globalThis as unknown as { __circleMetrics?: CircleMetrics };

function build(): CircleMetrics {
   const registry = new Registry();
   registry.setDefaultLabels({ application: 'circle' });
   collectDefaultMetrics({ register: registry }); // process/heap/eventloop/gc do Node
   const httpRequests = new Counter({
      name: 'http_requests_total',
      help: 'Total de requests HTTP tratados pelos route handlers',
      labelNames: ['method', 'status'] as const,
      registers: [registry],
   });
   const httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duração dos requests HTTP (segundos)',
      labelNames: ['method', 'status'] as const,
      buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [registry],
   });
   return { registry, httpRequests, httpDuration };
}

export function getMetrics(): CircleMetrics {
   if (!g.__circleMetrics) g.__circleMetrics = build();
   return g.__circleMetrics;
}

/** Registra um request no counter + histogram. Nunca lança (observabilidade é best-effort). */
export function observeHttp(method: string, status: number, seconds: number): void {
   try {
      const m = getMetrics();
      const labels = { method: method || 'UNKNOWN', status: String(status) };
      m.httpRequests.inc(labels);
      m.httpDuration.observe(labels, seconds);
   } catch {
      /* no-op: métrica não pode quebrar a request */
   }
}
