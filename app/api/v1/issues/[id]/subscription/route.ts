import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { subscribeToIssue, unsubscribeFromIssue } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** POST /issues/{id}/subscription — passa a seguir a issue (idempotente). */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const me = await getOrCreateUser(db, email);
      await subscribeToIssue(db, id, me.id, email);
      return ok({ id, subscribed: true });
   }, req);
}

/** DELETE /issues/{id}/subscription — deixa de seguir a issue. */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const me = await getOrCreateUser(db, email);
      await unsubscribeFromIssue(db, id, me.id, email);
      return ok({ id, subscribed: false });
   }, req);
}
