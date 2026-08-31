import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, parseIssueListOptions, requireEmail } from '@/lib/api/http';
import { emailFromRequest } from '@/lib/api/auth';
import { listIssues } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      const sp = new URL(req.url).searchParams;
      const meEmail = (await emailFromRequest(req)) ?? undefined;
      const { opts } = parseIssueListOptions(sp, meEmail);
      opts.project = [id];
      return ok(await listIssues(db, opts));
   });
}
