import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { updateComment, deleteComment, resolveComment } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// `body` edita o texto (só o autor); `resolved` resolve/reabre a thread (raiz; autor,
// assignee ou admin). Ao menos um dos dois. Com ambos, aplica na ordem body → resolved.
const CommentSchema = z
   .object({
      body: z.string().min(1).max(10000).optional(),
      resolved: z.boolean().optional(),
   })
   .refine((v) => v.body !== undefined || v.resolved !== undefined, {
      message: "Informe 'body' e/ou 'resolved'",
   });

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const { body, resolved } = CommentSchema.parse(await req.json());
      let updated = body !== undefined ? await updateComment(db, id, body, email) : undefined;
      if (updated !== null && resolved !== undefined)
         updated = await resolveComment(db, id, resolved, email);
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
