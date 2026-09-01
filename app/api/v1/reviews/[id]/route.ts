import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getReview } from '@/lib/api/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      const dto = await getReview(db, decodeURIComponent(id));
      return dto ? ok(dto) : notFound(`Review '${id}' não encontrado`);
   }, req);
}
