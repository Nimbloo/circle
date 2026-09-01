import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getIssueDetail, updateIssueContent } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      const dto = await getIssueDetail(db, id);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   }, req);
}

const PatchSchema = z.object({
   description: z.string().max(20000).nullish(),
   milestone: z.string().max(196).nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const patch = PatchSchema.parse(await req.json());
      const dto = await updateIssueContent(db, id, patch);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   }, req);
}
