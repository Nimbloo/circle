import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { emailFromRequest, isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { getOrCreateUser } from '@/lib/api/users';
import { getTeam, updateTeam, deleteTeam } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = emailFromRequest(req);
      const meId = email ? (await getOrCreateUser(db, email)).id : undefined;
      const dto = await getTeam(db, teamKey, meId);
      return dto ? ok(dto) : notFound(`Team '${teamKey}' não encontrado`);
   });
}

const UpdateSchema = z.object({
   name: z.string().min(1).optional(),
   icon: z.string().nullish(),
   color: z.string().nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateTeam(db, teamKey, patch);
      return dto ? ok(dto) : notFound(`Team '${teamKey}' não encontrado`);
   });
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = requireEmail(req);
      if (!isAdmin(email)) throw new ApiError(403, 'Apenas admin');
      const removed = await deleteTeam(db, teamKey);
      return removed ? ok({ deleted: true }) : notFound(`Team '${teamKey}' não encontrado`);
   });
}
