import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getAttachmentBytes, removeAttachment } from '@/lib/api/attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; aid: string }> };

/** GET — serve os bytes do anexo. Imagens inline; demais como download (anti-XSS). */
export async function GET(_req: Request, { params }: Params) {
   const { aid } = await params;
   const bytes = await getAttachmentBytes(db, aid);
   if (!bytes) return new Response('Not found', { status: 404 });
   const buf = Buffer.from(bytes.data, 'base64');
   const inline = bytes.contentType.startsWith('image/') || bytes.contentType === 'application/pdf';
   const disposition = inline ? 'inline' : 'attachment';
   const filename = bytes.name.replace(/"/g, '');
   return new Response(buf, {
      status: 200,
      headers: {
         'Content-Type': bytes.contentType,
         'Content-Disposition': `${disposition}; filename="${filename}"`,
         'Cache-Control': 'private, max-age=31536000, immutable',
      },
   });
}

/** DELETE — remove o anexo. */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { aid } = await params;
      await requireEmail(req);
      const removed = await removeAttachment(db, aid);
      return removed ? ok({ deleted: true }) : notFound(`Anexo '${aid}' não encontrado`);
   });
}
