import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getCycle, updateCycle, deleteCycle } from '@/lib/api/cycles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const dto = await getCycle(db, id);
      return dto ? ok(dto) : notFound(`Cycle '${id}' não encontrado`);
   });
}

const UpdateSchema = z.object({
   name: z.string().min(1).optional(),
   status: z.enum(['planned', 'upcoming', 'current', 'completed']).optional(),
   startDate: z.string().min(1).optional(),
   endDate: z.string().min(1).optional(),
   capacity: z.number().int().min(0).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateCycle(db, id, patch);
      return dto ? ok(dto) : notFound(`Cycle '${id}' não encontrado`);
   });
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const removed = await deleteCycle(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Cycle '${id}' não encontrado`);
   });
}
