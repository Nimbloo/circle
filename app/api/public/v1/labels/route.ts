import { db } from '@/db';
import { handle } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { requireApiToken } from '@/lib/api/public-auth';
import { listLabels } from '@/lib/api/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/public/v1/labels — catálogo de labels (escopo `read`; global). */
export async function GET(req: Request) {
   return handle(async () => {
      await requireApiToken(db, req, 'read');
      return ok(await listLabels(db));
   }, req);
}
