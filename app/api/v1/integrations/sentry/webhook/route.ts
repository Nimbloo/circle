import { verifySignature, signatureFrom } from '@/lib/api/integrations/sentry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook base da integração (Sentry manda `installation.created/deleted` e outros
 * resources aqui). Verifica a assinatura e ACK 200 — a criação de card acontece pelo
 * `issue-link` (botão "Create" na issue do Sentry), não por auto-webhook (evita cards
 * duplicados sem tabela de dedup). Logamos o resource pra observabilidade.
 */
export async function POST(req: Request) {
   const raw = await req.text();
   const sig = signatureFrom(req.headers);
   if (!verifySignature(raw, sig)) {
      return new Response(JSON.stringify({ error: 'assinatura inválida' }), {
         status: 401,
         headers: { 'content-type': 'application/json' },
      });
   }
   const resource = req.headers.get('sentry-hook-resource') ?? 'unknown';
   console.log(`[circle] sentry webhook recebido: resource=${resource}`);
   return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
   });
}
