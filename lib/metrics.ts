import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

/**
 * Métricas Prometheus do Circle (Node runtime). Expostas em `/api/metrics`, raspadas
 * pelo Prometheus/Thanos do barramento Nimbloo (ver ServiceMonitor no chart).
 * Singleton por processo (globalThis) — sobrevive ao hot-reload do dev sem re-registrar.
 *
 * `route` é o PADRÃO da rota, não a URL: os identificadores viram `:id`, então o
 * conjunto de valores é fechado (as rotas do app) e a cardinalidade não escapa — a
 * régua da casa é o tamanho do conjunto, não o "ser um id". Sem este rótulo não dá
 * para saber QUAL rota está lenta: na auditoria de setembro a métrica só conseguia
 * dizer "algo entre 30 ms e 245 ms", sem apontar onde.
 */
interface CircleMetrics {
   registry: Registry;
   httpRequests: Counter<'method' | 'status' | 'route'>;
   httpDuration: Histogram<'method' | 'status' | 'route'>;
}

const g = globalThis as unknown as { __circleMetrics?: CircleMetrics };

function build(): CircleMetrics {
   const registry = new Registry();
   registry.setDefaultLabels({ application: 'circle' });
   collectDefaultMetrics({ register: registry }); // process/heap/eventloop/gc do Node
   const httpRequests = new Counter({
      name: 'http_requests_total',
      help: 'Total de requests HTTP tratados pelos route handlers',
      labelNames: ['method', 'status', 'route'] as const,
      registers: [registry],
   });
   const httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duração dos requests HTTP (segundos)',
      labelNames: ['method', 'status', 'route'] as const,
      buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [registry],
   });
   return { registry, httpRequests, httpDuration };
}

export function getMetrics(): CircleMetrics {
   if (!g.__circleMetrics) g.__circleMetrics = build();
   return g.__circleMetrics;
}

/**
 * Padrão da rota a partir da URL: troca por `:id` o que é identificador (uuid,
 * `CORE-123`, token de convite). É o que mantém o rótulo com conjunto fechado.
 */
export function routePattern(url: string | undefined): string {
   if (!url) return 'unknown';
   let path: string;
   try {
      path = new URL(url, 'http://x').pathname;
   } catch {
      return 'unknown';
   }
   const parts = path.split('/').map((seg) => {
      if (!seg) return seg;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(seg)) return ':id'; // uuid
      if (/^[A-Z][A-Z0-9]*-[0-9]+$/.test(seg)) return ':id'; // identifier CORE-123
      if (seg.length > 16 && /[0-9]/.test(seg)) return ':id'; // tokens opacos
      return seg;
   });
   return parts.join('/') || '/';
}

/** Registra um request no counter + histogram. Nunca lança (observabilidade é best-effort). */
export function observeHttp(method: string, status: number, seconds: number, route?: string): void {
   try {
      const m = getMetrics();
      const labels = {
         method: method || 'UNKNOWN',
         status: String(status),
         route: route ?? 'unknown',
      };
      m.httpRequests.inc(labels);
      m.httpDuration.observe(labels, seconds);
   } catch {
      /* no-op: métrica não pode quebrar a request */
   }
}
