import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { notFound, ok } from '@/lib/api/response';
import { getImportJob } from '@/lib/api/import';
import { getOrCreateUser } from '@/lib/api/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** GET /import/jobs/{id} — progresso e resultado do import em background (só o dono). */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const me = await getOrCreateUser(db, await requireEmail(req));
      const job = await getImportJob(db, id, me.id);
      return job ? ok(job) : notFound(`Import '${id}' não encontrado`);
   }, req);
}
