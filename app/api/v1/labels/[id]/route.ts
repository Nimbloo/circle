import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { updateLabel, deleteLabel } from '@/lib/api/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
   name: z.string().min(1).optional(),
   color: z.string().min(1).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateLabel(db, id, patch);
      return dto ? ok(dto) : notFound(`Label '${id}' não encontrado`);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const removed = await deleteLabel(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Label '${id}' não encontrado`);
   }, req);
}
