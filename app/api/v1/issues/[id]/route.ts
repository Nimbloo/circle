import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getIssue, updateIssue, deleteIssue } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const dto = await getIssue(db, id);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   });
}

const UpdateSchema = z.object({
   title: z.string().min(1).max(512).optional(),
   statusId: z.string().max(64).optional(),
   priorityId: z.string().max(64).optional(),
   assigneeId: z.string().max(36).nullish(),
   projectId: z.string().max(36).nullish(),
   cycleId: z.string().max(36).nullish(),
   dueDate: z.string().date().nullish(),
   estimate: z.number().int().min(0).max(1000).nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateIssue(db, id, patch, email);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   });
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const removed = await deleteIssue(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Issue '${id}' não encontrada`);
   });
}
