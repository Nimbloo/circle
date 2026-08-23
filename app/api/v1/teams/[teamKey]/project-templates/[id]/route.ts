import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { updateProjectTemplate, deleteProjectTemplate } from '@/lib/api/project-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string; id: string }> };

const UpdateSchema = z.object({
   name: z.string().min(1).max(128).optional(),
   projectName: z.string().max(256).nullish(),
   description: z.string().nullish(),
   statusId: z.string().nullish(),
   priorityId: z.string().nullish(),
   healthId: z.string().nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateProjectTemplate(db, id, patch);
      if (!dto) throw new ApiError(404, 'Template não encontrado');
      return ok(dto);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const removed = await deleteProjectTemplate(db, id);
      if (!removed) throw new ApiError(404, 'Template não encontrado');
      return ok({ deleted: true });
   }, req);
}
