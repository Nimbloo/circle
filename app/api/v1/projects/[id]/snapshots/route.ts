import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getProjectSnapshots } from '@/lib/api/project-snapshots';
import { assertProjectInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Série diária de progresso do projeto. Grava o dia corrente antes de ler (lazy). */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const { teamIds } = await scopeForEmail(db, email);
      await assertProjectInScope(db, teamIds, id);
      return ok(await getProjectSnapshots(db, id));
   }, req);
}
