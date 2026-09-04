import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { listTeamSlas, setTeamSla, MAX_SLA_HOURS } from '@/lib/api/slas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { teamKey } = await params;
      return ok(await listTeamSlas(db, teamKey));
   }, req);
}

const PutSchema = z.object({
   priorityId: z.string().min(1),
   /** null remove o SLA da prioridade. */
   hours: z.number().int().min(1).max(MAX_SLA_HOURS).nullable(),
});

export async function PUT(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const { priorityId, hours } = PutSchema.parse(await req.json());
      return ok(await setTeamSla(db, teamKey, priorityId, hours));
   }, req);
}
