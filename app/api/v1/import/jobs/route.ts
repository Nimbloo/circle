import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { getActiveImportJob } from '@/lib/api/import';
import { getOrCreateUser } from '@/lib/api/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /import/jobs — job de import ativo do usuário (ou null). */
export async function GET(req: Request) {
   return handle(async () => {
      const me = await getOrCreateUser(db, await requireEmail(req));
      return ok(await getActiveImportJob(db, me.id));
   }, req);
}
