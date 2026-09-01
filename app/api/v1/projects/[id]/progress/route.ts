import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { projectProgress } from '@/lib/api/aggregations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      const res = await projectProgress(db, id);
      return res ? ok(res) : notFound(`Project '${id}' não encontrado`);
   }, req);
}
