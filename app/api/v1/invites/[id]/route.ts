import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { revokeInvite } from '@/lib/api/invites';
import { getOrCreateUser } from '@/lib/api/users';
import { recordAudit } from '@/lib/api/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** DELETE /invites/{id} — revoga. O link deixa de funcionar na hora. */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const actor = await requireEmail(req);
      if (!(await isAdmin(actor, db))) throw new ApiError(403, 'Apenas admin');
      const { id } = await params;

      if (!(await revokeInvite(db, id))) return notFound(`Convite '${id}' não encontrado`);

      const actorUser = await getOrCreateUser(db, actor);
      await recordAudit(db, {
         actorId: actorUser.id,
         action: 'invite.revoke',
         targetType: 'invite',
         targetId: id,
      });
      return ok({ deleted: true });
   }, req);
}
