import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { updateDocument, deleteDocument } from '@/lib/api/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
   name: z.string().min(1).optional(),
   icon: z.string().nullish(),
   pinned: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const patch = UpdateSchema.parse(await req.json());
      const okd = await updateDocument(db, id, patch);
      return okd ? ok({ id }) : notFound(`Documento '${id}' não encontrado`);
   });
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const removed = await deleteDocument(db, id);
      return removed ? ok({ deleted: true }) : notFound(`Documento '${id}' não encontrado`);
   });
}
