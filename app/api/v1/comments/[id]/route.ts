import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { updateComment, deleteComment } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const CommentSchema = z.object({ body: z.string().min(1).max(10000) });

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const { body } = CommentSchema.parse(await req.json());
      const updated = await updateComment(db, id, body, email);
      if (!updated) return notFound('Comentário não encontrado');
      return ok(updated);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const deleted = await deleteComment(db, id, email);
      if (!deleted) return notFound('Comentário não encontrado');
      return ok({ deleted: true });
   }, req);
}
