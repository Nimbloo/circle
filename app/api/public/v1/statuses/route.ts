import { db } from '@/db';
import { handle } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { requireApiToken } from '@/lib/api/public-auth';
import { listStatuses } from '@/lib/api/catalogs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/public/v1/statuses — catálogo de status (escopo `read`; global, sem escopo de time). */
export async function GET(req: Request) {
   return handle(async () => {
      await requireApiToken(db, req, 'read');
      return ok(await listStatuses(db));
   }, req);
}
