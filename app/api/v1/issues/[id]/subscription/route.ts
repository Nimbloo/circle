import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { assertIssueInScope, scopeForEmail } from '@/lib/api/scope';
import { isSubscribedToIssue, subscribeToIssue, unsubscribeFromIssue } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** GET /issues/{id}/subscription — o usuário segue a issue? (inclui issue fechada). */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      // Escopo (#20): convidado não sonda issue de time que não enxerga.
      const { user: me, teamIds } = await scopeForEmail(db, email);
      await assertIssueInScope(db, teamIds, id);
      return ok({ id, subscribed: await isSubscribedToIssue(db, id, me.id) });
   }, req);
}

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
