import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { projectProgress } from '@/lib/api/aggregations';
import { assertProjectInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const { teamIds } = await scopeForEmail(db, email);
      await assertProjectInScope(db, teamIds, id);
      const res = await projectProgress(db, id);
      return res ? ok(res) : notFound(`Project '${id}' não encontrado`);
   }, req);
}
