import { db } from '@/db';
import { handle } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { requireApiClient } from '@/lib/api/public-auth';
import { listLabels } from '@/lib/api/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/public/v1/labels — catálogo de labels (global). */
export async function GET(req: Request) {
   return handle(async () => {
      await requireApiClient(db, req);
      return ok(await listLabels(db));
   }, req);
}
