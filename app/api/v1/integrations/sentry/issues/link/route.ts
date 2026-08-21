import { db } from '@/db';
import { linkCardFromSentry, verifySignature } from '@/lib/api/integrations/sentry';

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
   const raw = await req.text();
   const sig = req.headers.get('sentry-hook-signature');
   if (!verifySignature(raw, sig)) return json({ error: 'assinatura inválida' }, 401);

   let body: { fields?: Record<string, string> };
   try {
      body = JSON.parse(raw);
   } catch {
      return json({ error: 'JSON inválido' }, 400);
   }

   const identifier = body.fields?.identifier ?? body.fields?.issueId;
   const result = await linkCardFromSentry(db, identifier ?? '');
   if (!result) return json({ error: `card '${identifier}' não encontrado` }, 404);
   return json(result, 200);
}
