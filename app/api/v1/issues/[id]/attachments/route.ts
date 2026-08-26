import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { addAttachment } from '@/lib/api/attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const UploadSchema = z.object({
   name: z.string().min(1).max(512),
   contentType: z.string().min(1).max(128),
   dataUrl: z.string().min(1).max(10_000_000), // ~7MB base64 + overhead
});

/** POST /issues/{id}/attachments — anexa um arquivo (base64) à issue. */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const input = UploadSchema.parse(await req.json());
      const dto = await addAttachment(db, id, input, email);
      return ok(dto);
   });
}
