import { getMetrics } from '@/lib/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exposição Prometheus (text format). Raspada pelo Prometheus/Thanos do barramento
 * (ServiceMonitor no chart circle-prd). Público no middleware — só métricas técnicas
 * (RED + process), acesso interno via cluster/VPN. Não expõe dado de negócio/PII.
 */
export async function GET(): Promise<Response> {
   const { registry } = getMetrics();
   const body = await registry.metrics();
   return new Response(body, {
      status: 200,
      headers: { 'content-type': registry.contentType },
   });
}
