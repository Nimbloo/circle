import { db } from '@/db';
import { verifySignature, signatureFrom } from '@/lib/api/integrations/github';
import {
   handleCheckRunEvent,
   handlePullRequestEvent,
   type CheckRunEvent,
   type PullRequestEvent,
} from '@/lib/api/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook do GitHub (eventos `pull_request`) — link PR↔issue em TEMPO REAL, sem
 * depender do polling `reviews.sync`. Verifica a assinatura HMAC (`X-Hub-Signature-256`)
 * e ACK 200. Autenticado por HMAC, não por sessão → allowlist no middleware.
 */
export async function POST(req: Request) {
   const raw = await req.text();
   if (!verifySignature(raw, signatureFrom(req.headers))) {
      return new Response(JSON.stringify({ error: 'assinatura inválida' }), {
         status: 401,
         headers: { 'content-type': 'application/json' },
      });
   }

   const event = req.headers.get('x-github-event') ?? 'unknown';
   if (event === 'ping') {
      return Response.json({ ok: true, pong: true });
   }
   const isCheckEvent = event === 'check_run' || event === 'check_suite';
   if (event !== 'pull_request' && !isCheckEvent) {
      // ACK a outros eventos sem processar (evita re-entrega do GitHub).
      return Response.json({ ok: true, ignored: event });
   }

   let payload: (PullRequestEvent & CheckRunEvent & { action?: string }) | null = null;
   try {
      payload = JSON.parse(raw);
   } catch {
      return new Response(JSON.stringify({ error: 'payload inválido' }), {
         status: 400,
         headers: { 'content-type': 'application/json' },
      });
   }

   try {
      if (isCheckEvent) {
         // Só o estado final interessa (`completed`); os demais actions viram ACK.
         if (payload?.action !== 'completed') return Response.json({ ok: true, ignored: event });
         const { updated } = await handleCheckRunEvent(db, payload);
         return Response.json({ ok: true, updated });
      }
      const { linked } = await handlePullRequestEvent(db, payload ?? {});
      return Response.json({ ok: true, linked });
   } catch (e) {
      console.warn('[circle] github webhook falhou:', (e as Error).message);
      // 200 mesmo em erro de processamento: evita retry storm do GitHub; o polling
      // (`reviews.sync`) reconcilia o que o webhook não conseguir gravar.
      return Response.json({ ok: false });
   }
}
