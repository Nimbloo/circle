import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, parseIssueListOptions, requireEmail } from '@/lib/api/http';
import { emailFromRequest } from '@/lib/api/auth';
import { listIssues } from '@/lib/api/issues';
import { assertTeamInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { teamKey } = await params;
      const sp = new URL(req.url).searchParams;
      const meEmail = (await emailFromRequest(req)) ?? undefined;
      const { opts } = parseIssueListOptions(sp, meEmail);
      // Guest fora do time (#100): 403, não lista vazia — o time nem existe pra ele.
      const { teamIds } = await scopeForEmail(db, email);
      assertTeamInScope(teamIds, teamKey);
      opts.team = teamKey; // escopo por time
      return ok(await listIssues(db, opts));
   }, req);
}
