import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getView, updateView, deleteView } from '@/lib/api/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const dto = await getView(db, id);
      return dto ? ok(dto) : notFound(`View '${id}' não encontrada`);
   });
}

const UpdateSchema = z.object({
   name: z.string().min(1).optional(),
   description: z.string().nullish(),
   icon: z.string().nullish(),
   filter: z
      .object({
         statusCategories: z.array(z.string()).optional(),
         statusIds: z.array(z.string()).optional(),
         labelIds: z.array(z.string()).optional(),
         priorityIds: z.array(z.string()).optional(),
         hasProject: z.boolean().optional(),
         unassigned: z.boolean().optional(),
      })
      .optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const dto = await updateView(db, id, patch);
      return dto ? ok(dto) : notFound(`View '${id}' não encontrada`);
   });
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const removed = await deleteView(db, id);
      return removed ? ok({ deleted: true }) : notFound(`View '${id}' não encontrada`);
   });
}
