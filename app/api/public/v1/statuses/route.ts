import { db } from '@/db';
import { handle } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { requireApiClient } from '@/lib/api/public-auth';
import { listStatuses } from '@/lib/api/catalogs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/public/v1/statuses — catálogo de status (global, sem escopo de time). */
export async function GET(req: Request) {
   return handle(async () => {
      await requireApiClient(db, req);
      return ok(await listStatuses(db));
   }, req);
}
