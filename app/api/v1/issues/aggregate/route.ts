import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { issueMatrix } from '@/lib/api/aggregations';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';
import { ApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const sp = new URL(req.url).searchParams;
      const team = sp.get('team') ?? undefined;
      // A matriz é do workspace inteiro: para quem tem escopo restrito, só faz sentido
      // por TIME. Sem `team`, o total global vazaria a contagem de times de fora.
      const { teamIds } = await scopeForEmail(db, email);
      if (teamIds) {
         if (!team) throw new ApiError(403, 'Informe um time do seu escopo (`?team=`)');
         assertTeamInScope(teamIds, team);
      }
      return ok(await issueMatrix(db, { team }));
   }, req);
}
