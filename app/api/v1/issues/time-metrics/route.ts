import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { timeMetrics } from '@/lib/api/aggregations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      const sp = new URL(req.url).searchParams;
      const weeksRaw = sp.get('weeks');
      const weeks = weeksRaw ? Math.min(26, Math.max(1, Number(weeksRaw) || 8)) : undefined;
      return ok(await timeMetrics(db, { team: sp.get('team') ?? undefined, weeks }));
   });
}
