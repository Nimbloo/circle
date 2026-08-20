import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle } from '@/lib/api/http';
import { getIssueDetail } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const dto = await getIssueDetail(db, id);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   });
}
