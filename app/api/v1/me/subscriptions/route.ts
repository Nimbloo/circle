import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { listSubscribedIssueIds } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /me/subscriptions — TODAS as issues que o usuário segue, abertas e fechadas. O
 * bootstrap só traz as abertas; a aba "Subscribed" de My issues lê daqui.
 */
export async function GET(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const user = await getOrCreateUser(db, email);
      return ok({ issueIds: await listSubscribedIssueIds(db, user.id) });
   }, req);
}
