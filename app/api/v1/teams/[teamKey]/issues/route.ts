import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, parseIssueListOptions } from '@/lib/api/http';
import { emailFromRequest } from '@/lib/api/auth';
import { listIssues } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const sp = new URL(req.url).searchParams;
      const meEmail = emailFromRequest(req) ?? undefined;
      const { opts } = parseIssueListOptions(sp, meEmail);
      opts.team = teamKey; // escopo por time
      return ok(await listIssues(db, opts));
   });
}
