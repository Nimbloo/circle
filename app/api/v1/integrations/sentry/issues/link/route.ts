import { db } from '@/db';
import { problem } from '@/lib/api/response';
import { SENTRY_WEBHOOK_MAX_BYTES, payloadTooLarge, readBodyLimited } from '@/lib/api/http';
import { linkCardFromSentry, verifySignature, signatureFrom } from '@/lib/api/integrations/sentry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
   return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
   });
}

/**
 * Sentry Integration Platform — `issue-link.link`. Linka uma issue do Sentry a um card
 * EXISTENTE do Circle (por identifier, ex.: CORE-12). Body: `{fields:{identifier}, ...}`.
 * Resposta: `{webUrl, project, identifier}` ou 404 se o card não existe.
 */
export async function POST(req: Request) {
   const raw = await readBodyLimited(req, SENTRY_WEBHOOK_MAX_BYTES);
   if (raw === null) return payloadTooLarge();
   const sig = signatureFrom(req.headers);
   if (!verifySignature(raw, sig)) return json({ error: 'assinatura inválida' }, 401);

   let body: { fields?: Record<string, string> };
   try {
      body = JSON.parse(raw);
   } catch {
      return json({ error: 'JSON inválido' }, 400);
   }

   const identifier = body.fields?.identifier ?? body.fields?.issueId;
   // Assinado não quer dizer bem tipado: `.trim()` num número virava 500 sem tratamento.
   if (identifier != null && typeof identifier !== 'string') {
      const detail = 'fields.identifier precisa ser texto';
      return problem(400, 'Bad Request', detail, { error: detail });
   }
   const result = await linkCardFromSentry(db, identifier ?? '');
   if (!result) return json({ error: `card '${identifier}' não encontrado` }, 404);
   return json(result, 200);
}
