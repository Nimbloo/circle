import { db } from '@/db';
import { listHealthStates } from '@/lib/api/catalogs';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      return ok(await listHealthStates(db));
   });
}
