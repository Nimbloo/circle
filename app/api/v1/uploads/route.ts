import { z } from 'zod';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { uploadImage } from '@/lib/api/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UploadSchema = z.object({
   // 5 MB em base64 (~6,7 MB) + prefixo do data-URL.
   dataUrl: z.string().min(1).max(7_200_000),
   contentType: z.string().min(1).max(64),
   fileName: z.string().max(255).nullish(),
});

/** POST /uploads — sobe uma imagem do editor (S3 + CDN) e devolve `{ url }`. */
export async function POST(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      const input = UploadSchema.parse(await req.json());
      return ok(await uploadImage(input));
   }, req);
}
