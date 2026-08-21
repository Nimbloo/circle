import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { getMember, updateMemberRole } from '@/lib/api/members';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const dto = await getMember(db, id);
      return dto ? ok(dto) : notFound(`Membro '${id}' não encontrado`);
   });
}

const UpdateSchema = z.object({ role: z.string().min(1) });

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const { role } = UpdateSchema.parse(await req.json());
      const dto = await updateMemberRole(db, id, role);
      return dto ? ok(dto) : notFound(`Membro '${id}' não encontrado`);
   });
}
