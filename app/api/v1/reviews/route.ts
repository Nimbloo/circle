import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle } from '@/lib/api/http';
import { listReviews } from '@/lib/api/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const sp = new URL(req.url).searchParams;
      return ok(await listReviews(db, { status: sp.get('status') ?? undefined }));
   });
}
