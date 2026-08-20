import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { markAllRead } from '@/lib/api/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
   return handle(async () => {
      const email = requireEmail(req);
      const me = await getOrCreateUser(db, email);
      return ok({ marked: await markAllRead(db, me.id) });
   });
}
