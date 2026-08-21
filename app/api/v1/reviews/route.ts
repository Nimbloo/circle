import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle } from '@/lib/api/http';
import { listReviews } from '@/lib/api/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lê um inteiro >= min da query, aplicando default e teto. */
function intParam(raw: string | null, def: number, min: number, max: number): number {
   const n = Number.parseInt(raw ?? '', 10);
   if (Number.isNaN(n)) return def;
   return Math.min(Math.max(n, min), max);
}

export async function GET(req: Request) {
   return handle(async () => {
      const sp = new URL(req.url).searchParams;
      const limit = intParam(sp.get('limit'), 50, 1, 200);
      const offset = intParam(sp.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
      const { items, total } = await listReviews(db, {
         status: sp.get('status') ?? undefined,
         limit,
         offset,
      });
      return ok(items, { total, limit, offset });
   });
}
