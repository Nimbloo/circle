import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { updateMilestone, deleteMilestone } from '@/lib/api/project-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; mid: string }> };

const PatchSchema = z.object({
   name: z.string().min(1).max(196).optional(),
   targetDate: z.string().date().nullish(),
   completed: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { mid } = await params;
      await requireEmail(req);
      const patch = PatchSchema.parse(await req.json());
      const dto = await updateMilestone(db, mid, patch);
      return dto ? ok(dto) : notFound(`Milestone '${mid}' não encontrado`);
   });
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { mid } = await params;
      await requireEmail(req);
      const removed = await deleteMilestone(db, mid);
      return removed ? ok({ deleted: true }) : notFound(`Milestone '${mid}' não encontrado`);
   });
}
