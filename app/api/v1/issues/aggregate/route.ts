import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { issueMatrix } from '@/lib/api/aggregations';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const sp = new URL(req.url).searchParams;
      const team = sp.get('team') ?? undefined;
      // A matriz é do workspace inteiro; para quem tem escopo restrito ela é recortada
      // pelos times visíveis, senão o total global vazaria a contagem de times de fora.
      const { teamIds } = await scopeForEmail(db, email);
      if (teamIds && team) {
         // Time explícito: precisa estar no escopo. Sem `team`, a agregação passa a ser
         // dos times visíveis (o serviço aplica `teamIds`) em vez de exigir o parâmetro.
         assertTeamInScope(teamIds, team);
      }
      return ok(await issueMatrix(db, { team, teamIds: teamIds ?? undefined }));
   }, req);
}
