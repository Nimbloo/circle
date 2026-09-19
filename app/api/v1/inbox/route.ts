import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail, multi } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { listInboxPage } from '@/lib/api/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Paginação por cursor (co#3, aditiva): `data` segue sendo o array; `meta.nextCursor`
// é o cursor da próxima página (null na última).
const PageSchema = z.object({
   limit: z.coerce.number().int().min(1).max(500).optional(),
   cursor: z.string().min(1).max(36).optional(),
});

export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const me = await getOrCreateUser(db, email);
      const sp = new URL(req.url).searchParams;
      const readParam = sp.get('read');
      const page = PageSchema.parse({
         limit: sp.get('limit') ?? undefined,
         cursor: sp.get('cursor') ?? undefined,
      });
      const { items, nextCursor } = await listInboxPage(db, me.id, {
         read: readParam === null ? undefined : readParam === 'true',
         type: multi(sp, 'type'),
         snoozed: sp.get('snoozed') === 'true',
         ...page,
      });
      return ok(items, { nextCursor });
   }, req);
}
