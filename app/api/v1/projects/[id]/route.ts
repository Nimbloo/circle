import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getProject, updateProject, deleteProject } from '@/lib/api/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const dto = await getProject(db, id);
      return dto ? ok(dto) : notFound(`Project '${id}' não encontrado`);
   });
}

const UpdateSchema = z.object({
   name: z.string().min(1).optional(),
   statusId: z.string().optional(),
   priorityId: z.string().optional(),
   healthId: z.string().optional(),
   leadId: z.string().nullish(),
   iconKey: z.string().nullish(),
   percentComplete: z.number().int().min(0).max(100).optional(),
   startDate: z.string().nullish(),
   targetDate: z.string().nullish(),
   initiativeId: z.string().nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateProject(db, id, patch);
      return dto ? ok(dto) : notFound(`Project '${id}' não encontrado`);
   });
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const removed = await deleteProject(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Project '${id}' não encontrado`);
   });
}
