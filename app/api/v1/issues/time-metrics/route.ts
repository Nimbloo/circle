import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { timeMetrics } from '@/lib/api/aggregations';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';

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
      if (teamIds && team) {
         // Com time explícito, ele precisa estar no escopo; sem ele, o serviço recorta
         // pelos times visíveis (#100) em vez de exigir o parâmetro.
         assertTeamInScope(teamIds, team);
      }
      return ok(await timeMetrics(db, { team, weeks, teamIds: teamIds ?? undefined }));
   }, req);
}
