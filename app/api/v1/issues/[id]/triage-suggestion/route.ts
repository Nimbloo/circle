import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { ensureTriageSuggestion } from '@/lib/api/triage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /issues/{id}/triage-suggestion — sugestão de triagem da issue, gerada na hora
 * quando ainda não existe (lazy; sem CronJob). 404 se a issue não existe.
 */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      return ok(await ensureTriageSuggestion(db, id));
   }, req);
}
