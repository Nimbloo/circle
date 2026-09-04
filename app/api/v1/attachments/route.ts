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
 * Margem sobre o limite do arquivo para o overhead do envelope multipart (boundaries,
 * headers de parte, os campos de texto). Só serve para o corte GROSSO do `Content-Length`:
 * o limite exato continua sendo checado no `file.size`.
 */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * POST /attachments — multipart (`file`, `issueId`, `commentId?`). Sobe pro S3/CDN e grava
 * o anexo da issue (ou do comentário). 25 MB; allow-list por MIME + extensão.
 */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      // Corte GROSSO pelo `Content-Length` ANTES de tocar no corpo: `req.formData()`
      // materializa o multipart inteiro na memória, então checar o tamanho só depois
      // dele é um vetor de exaustão de memória — qualquer autenticado subia 2 GB e o
      // 413 só chegava com o pod já inchado.
      const declared = Number(req.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_ATTACHMENT_BYTES + MULTIPART_OVERHEAD_BYTES)
         throw new ApiError(413, 'Arquivo excede o tamanho máximo (25 MB)');
      const form = await req.formData().catch(() => {
         throw new ApiError(400, 'Corpo multipart inválido');
      });
      const file = form.get('file');
      if (!(file instanceof Blob)) throw new ApiError(400, "Campo 'file' é obrigatório");
      const issueId = text(form, 'issueId');
      if (!issueId) throw new ApiError(400, "Campo 'issueId' é obrigatório");
      // Limite exato pelo tamanho real da parte (o corte acima é só a primeira barreira).
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
