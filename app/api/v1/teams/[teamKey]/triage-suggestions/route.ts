import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listTeamTriageSuggestions } from '@/lib/api/triage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

/**
 * GET /teams/{teamKey}/triage-suggestions — sugestões da fila de Triage do time. As
 * que faltam são geradas LAZY em background (sem CronJob); os cards chegam pelo
 * evento realtime, então a fila não espera pelo modelo.
 */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { teamKey } = await params;
      return ok(await listTeamTriageSuggestions(db, teamKey));
   }, req);
}
