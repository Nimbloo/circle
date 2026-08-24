import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { subscribeUsers, unsubscribeUser } from '@/lib/api/subscriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** O usuário atual passa a SEGUIR a issue (recebe notificação da atividade). */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const user = await getOrCreateUser(db, await requireEmail(req));
      await subscribeUsers(db, id, [user.id]);
      return ok({ subscribed: true });
   });
}

/** O usuário atual deixa de seguir a issue. */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const user = await getOrCreateUser(db, await requireEmail(req));
      await unsubscribeUser(db, id, user.id);
      return ok({ subscribed: false });
   });
}
