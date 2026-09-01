import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { getOrCreateUser } from '@/lib/api/users';
import { decideJoinRequest, listJoinRequests } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string; id: string }> };

const DecideSchema = z.object({ decision: z.enum(['approved', 'denied']) });

/** POST /teams/{teamKey}/join-requests/{id} — admin aprova/nega a solicitação. */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey, id } = await params;
      const actor = await requireEmail(req);
      if (!(await isAdmin(actor, db))) throw new ApiError(403, 'Apenas admin');
      const { decision } = DecideSchema.parse(await req.json());
      const me = await getOrCreateUser(db, actor);
      await decideJoinRequest(db, teamKey, id, decision, me.id);
      return ok(await listJoinRequests(db, teamKey));
   }, req);
}
