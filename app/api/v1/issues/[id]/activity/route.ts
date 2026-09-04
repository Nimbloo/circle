import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { emailFromRequest } from '@/lib/api/auth';
import { listActivity } from '@/lib/api/issue-detail';
import { assertIssueInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      // O feed traz o CORPO dos comentários: sem escopo, uma issue alheia vazava inteira.
      const { teamIds } = await scopeForEmail(db, email);
      await assertIssueInScope(db, teamIds, id);
      return ok(await listActivity(db, id, (await emailFromRequest(req)) ?? undefined));
   }, req);
}
