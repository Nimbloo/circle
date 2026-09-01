import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { reorderIssue } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const RankSchema = z.object({
   beforeId: z.string().nullish(),
   afterId: z.string().nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const { beforeId, afterId } = RankSchema.parse(await req.json());
      const dto = await reorderIssue(db, id, beforeId, afterId);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   }, req);
}
