import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { deleteReviewComment, updateReviewComment } from '@/lib/api/review-comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; commentId: string }> };

const BodySchema = z.object({ body: z.string().max(10000) });

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id, commentId } = await params;
      const { body } = BodySchema.parse(await req.json());
      const updated = await updateReviewComment(db, decodeURIComponent(id), commentId, body, email);
      if (!updated) return notFound('Comentário não encontrado');
      return ok(updated);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id, commentId } = await params;
      const deleted = await deleteReviewComment(db, decodeURIComponent(id), commentId, email);
      if (!deleted) return notFound('Comentário não encontrado');
      return ok({ deleted: true });
   }, req);
}
