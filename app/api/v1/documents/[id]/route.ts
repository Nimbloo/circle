import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getDocPage, updateDocPage } from '@/lib/api/doc-pages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const dto = await getDocPage(db, id);
      return dto ? ok(dto) : notFound(`Documento '${id}' não encontrado`);
   });
}

const PatchSchema = z.object({
   title: z.string().max(512).optional(),
   content: z.string().max(1_000_000).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const patch = PatchSchema.parse(await req.json());
      const dto = await updateDocPage(db, id, patch);
      return ok(dto);
   });
}
