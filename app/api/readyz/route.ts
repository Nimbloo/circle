import { sql } from 'drizzle-orm';
import { db } from '@/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Readiness real: toca o Postgres (SELECT 1). Se o DB estiver fora, retorna 503
 * e o K8s tira o pod do Service (evita 5xx em massa). Liveness/startup seguem no
 * /api/healthz raso (só "o processo está vivo?"), pra não matar o pod por I/O externo.
 */
export async function GET() {
   try {
      await db.execute(sql`select 1`);
      return new Response(JSON.stringify({ status: 'ready' }), {
         status: 200,
         headers: { 'content-type': 'application/json' },
      });
   } catch (e) {
      // Loga a causa: é justamente o sinal que o endpoint existe pra detectar (DB fora).
      // Sem isso o pod fica `unready` no rollout sem rastro no stdout/Loki.
      console.error('[circle] readyz falhou (DB inacessível):', e);
      return new Response(JSON.stringify({ status: 'unready' }), {
         status: 503,
         headers: { 'content-type': 'application/json' },
      });
   }
}
