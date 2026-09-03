import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getProject, updateProject, deleteProject } from '@/lib/api/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      const dto = await getProject(db, id);
      return dto ? ok(dto) : notFound(`Project '${id}' não encontrado`);
   }, req);
}

const UpdateSchema = z.object({
   name: z.string().min(1).max(196).optional(),
   statusId: z.string().max(64).optional(),
   priorityId: z.string().max(64).optional(),
   healthId: z.string().max(64).optional(),
   leadId: z.string().max(36).nullish(),
   iconKey: z.string().max(64).nullish(),
   percentComplete: z.number().int().min(0).max(100).optional(),
   startDate: z.string().date().nullish(),
   targetDate: z.string().date().nullish(),
   initiativeId: z.string().max(36).nullish(),
   teamId: z.string().min(1).max(16).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateProject(db, id, patch, email);
      return dto ? ok(dto) : notFound(`Project '${id}' não encontrado`);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const removed = await deleteProject(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Project '${id}' não encontrado`);
   }, req);
}
