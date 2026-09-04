import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getInitiativeSnapshots } from '@/lib/api/roadmap';
import { assertInitiativeInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Série de progresso agregada da initiative (projetos da subárvore). */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const { teamIds } = await scopeForEmail(db, email);
      await assertInitiativeInScope(db, teamIds, id);
      return ok(await getInitiativeSnapshots(db, id, { teamIds: teamIds ?? undefined }));
   }, req);
}
