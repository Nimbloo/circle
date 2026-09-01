import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { requestToJoin, listJoinRequests } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

/** GET /teams/{teamKey}/join-requests — lista solicitações PENDENTES (admin). */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const actor = await requireEmail(req);
      if (!(await isAdmin(actor, db))) throw new ApiError(403, 'Apenas admin');
      return ok(await listJoinRequests(db, teamKey));
   }, req);
}

/** POST /teams/{teamKey}/join-requests — o usuário atual SOLICITA entrada no time. */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = await requireEmail(req);
      return ok(await requestToJoin(db, teamKey, email));
   }, req);
}
