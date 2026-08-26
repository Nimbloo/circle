import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail, multi } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { listInbox } from '@/lib/api/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const me = await getOrCreateUser(db, email);
      const sp = new URL(req.url).searchParams;
      const readParam = sp.get('read');
      const from = multi(sp, 'from') ?? [];
      return ok(
         await listInbox(db, me.id, {
            read: readParam === null ? undefined : readParam === 'true',
            type: multi(sp, 'type'),
            actorIds: from.length ? from : undefined,
         })
      );
   });
}
