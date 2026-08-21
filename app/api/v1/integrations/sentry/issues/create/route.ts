import { db } from '@/db';
import { ApiError } from '@/lib/api/errors';
import { createCardFromSentry, verifySignature } from '@/lib/api/integrations/sentry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** JSON helper (o Sentry NÃO consome ProblemDetail — usa shape próprio). */
function json(body: unknown, status = 200): Response {
   return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
   });
}

/**
 * Sentry Integration Platform — `issue-link.create`. Cria um card no Circle a partir do
 * formulário "Create" do Sentry. Body: `{fields:{title,description,teamId}, issueId, webUrl,
 * project, actor}`. Resposta: `{webUrl, project, identifier}` (o Sentry mostra `project#identifier`).
 */
export async function POST(req: Request) {
   const raw = await req.text();
   const sig = req.headers.get('sentry-hook-signature');
   if (!verifySignature(raw, sig)) return json({ error: 'assinatura inválida' }, 401);

   let body: { fields?: Record<string, string>; webUrl?: string; issueId?: string };
   try {
      body = JSON.parse(raw);
   } catch {
      return json({ error: 'JSON inválido' }, 400);
   }

   try {
      const fields = body.fields ?? {};
      const result = await createCardFromSentry(db, {
         title: fields.title,
         description: fields.description,
         teamId: fields.teamId,
         sentryWebUrl: body.webUrl,
         sentryIssueId: body.issueId, // dedup: reenvio do mesmo erro reusa o card
      });
      return json(result, 200);
   } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      console.error('[circle] sentry create-card falhou:', e);
      return json({ error: 'erro ao criar o card' }, 500);
   }
}
