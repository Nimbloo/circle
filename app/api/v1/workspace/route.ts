import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { bootstrapWorkspace } from '@/lib/api/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      // `?rollover=0` (refetch de SSE) pula o auto-rollover de cycles (escrita).
      const rollover = new URL(req.url).searchParams.get('rollover') !== '0';
      return ok(await bootstrapWorkspace(db, email, { rollover }));
   }, req);
}
