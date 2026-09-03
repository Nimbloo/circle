import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { deleteAttachment } from '@/lib/api/attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** DELETE /attachments/:id — só quem anexou ou admin (403). Remove do S3 em best-effort. */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const deleted = await deleteAttachment(db, id, email);
      if (!deleted) return notFound('Anexo não encontrado');
      return ok({ deleted: true });
   }, req);
}
