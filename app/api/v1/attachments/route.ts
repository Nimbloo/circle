import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { ApiError } from '@/lib/api/errors';
import { createAttachment } from '@/lib/api/attachments';
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachment-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function text(form: FormData, key: string): string | null {
   const v = form.get(key);
   return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * POST /attachments — multipart (`file`, `issueId`, `commentId?`). Sobe pro S3/CDN e grava
 * o anexo da issue (ou do comentário). 25 MB; allow-list por MIME + extensão.
 */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const form = await req.formData().catch(() => {
         throw new ApiError(400, 'Corpo multipart inválido');
      });
      const file = form.get('file');
      if (!(file instanceof Blob)) throw new ApiError(400, "Campo 'file' é obrigatório");
      const issueId = text(form, 'issueId');
      if (!issueId) throw new ApiError(400, "Campo 'issueId' é obrigatório");
      // Rejeita pelo tamanho declarado ANTES de ler o corpo na memória.
      if (file.size > MAX_ATTACHMENT_BYTES)
         throw new ApiError(413, 'Arquivo excede o tamanho máximo (25 MB)');
      const name = 'name' in file && typeof file.name === 'string' ? file.name : '';
      const bytes = Buffer.from(await file.arrayBuffer());
      const dto = await createAttachment(
         db,
         { issueId, commentId: text(form, 'commentId'), file: { name, type: file.type, bytes } },
         email
      );
      return ok(dto);
   }, req);
}
