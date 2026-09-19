import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { getTeamDeletionImpact } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

/** O que a exclusão do time apaga junto (contagens), para o diálogo de confirmação. Só admin. */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const impact = await getTeamDeletionImpact(db, teamKey);
      return impact ? ok(impact) : notFound(`Team '${teamKey}' não encontrado`);
   }, req);
}
