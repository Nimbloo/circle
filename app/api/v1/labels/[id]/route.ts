import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
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
      requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateLabel(db, id, patch);
      return dto ? ok(dto) : notFound(`Label '${id}' não encontrado`);
   });
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const removed = await deleteLabel(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Label '${id}' não encontrado`);
   });
}
