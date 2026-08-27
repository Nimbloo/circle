import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { listMyActivity } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /me/activity — feed de atividade das issues que o usuário assina. */
export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const user = await getOrCreateUser(db, email);
      return ok(await listMyActivity(db, user.id));
   });
}
