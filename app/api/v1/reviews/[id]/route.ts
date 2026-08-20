import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle } from '@/lib/api/http';
import { getReview } from '@/lib/api/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const dto = await getReview(db, decodeURIComponent(id));
      return dto ? ok(dto) : notFound(`Review '${id}' não encontrado`);
   });
}
