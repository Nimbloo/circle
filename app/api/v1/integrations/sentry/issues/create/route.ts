import { db } from '@/db';
import { ApiError } from '@/lib/api/errors';
import { problem } from '@/lib/api/response';
import { SENTRY_WEBHOOK_MAX_BYTES, payloadTooLarge, readBodyLimited } from '@/lib/api/http';
import {
   createCardFromSentry,
   verifySignature,
   signatureFrom,
} from '@/lib/api/integrations/sentry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** JSON helper (o Sentry NÃO consome ProblemDetail — usa shape próprio). */
function json(body: unknown, status = 200): Response {
   return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
   });
}

/** 400 em ProblemDetail, com o `error` do shape antigo junto (o Sentry lê esse campo). */
function badField(detail: string): Response {
   return problem(400, 'Bad Request', detail, { error: detail });
}

/**
 * Sentry Integration Platform — `issue-link.create`. Cria um card no Circle a partir do
 * formulário "Create" do Sentry. Body: `{fields:{title,description,teamId}, issueId, webUrl,
 * project, actor}`. Resposta: `{webUrl, project, identifier}` (o Sentry mostra `project#identifier`).
 */
export async function POST(req: Request) {
   const raw = await readBodyLimited(req, SENTRY_WEBHOOK_MAX_BYTES);
   if (raw === null) return payloadTooLarge();
   const sig = signatureFrom(req.headers);
   if (!verifySignature(raw, sig)) return json({ error: 'assinatura inválida' }, 401);

   let body: { fields?: Record<string, string>; webUrl?: string; issueId?: string };
   try {
      body = JSON.parse(raw);
   } catch {
      return json({ error: 'JSON inválido' }, 400);
   }

   const fields = body.fields ?? {};
   // Assinado não quer dizer bem tipado: `.trim()` num número virava 500.
   const wrong = (['title', 'description', 'teamId'] as const).find(
      (k) => fields[k] != null && typeof fields[k] !== 'string'
   );
   if (wrong) return badField(`fields.${wrong} precisa ser texto`);

   try {
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
