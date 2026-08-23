import { z } from 'zod';
import { db } from '@/db';
import { updateStatus, deleteStatus } from '@/lib/api/statuses';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
   name: z.string().min(1).max(128).optional(),
   color: z.string().min(1).max(16).optional(),
   category: z.string().min(1).max(32).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateStatus(db, id, patch);
      if (!dto) throw new ApiError(404, 'Status não encontrado');
      return ok(dto);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const removed = await deleteStatus(db, id);
      if (!removed) throw new ApiError(404, 'Status não encontrado');
      return ok({ deleted: true });
   }, req);
}
