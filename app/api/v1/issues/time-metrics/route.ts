import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { timeMetrics } from '@/lib/api/aggregations';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';
import { ApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const sp = new URL(req.url).searchParams;
      const weeksRaw = sp.get('weeks');
      const weeks = weeksRaw ? Math.min(26, Math.max(1, Number(weeksRaw) || 8)) : undefined;
      const team = sp.get('team') ?? undefined;
      // Mesma regra do /aggregate: métrica de workspace só sai por time no escopo.
      const { teamIds } = await scopeForEmail(db, email);
      if (teamIds) {
         if (!team) throw new ApiError(403, 'Informe um time do seu escopo (`?team=`)');
         assertTeamInScope(teamIds, team);
      }
      return ok(await timeMetrics(db, { team, weeks }));
   }, req);
}
