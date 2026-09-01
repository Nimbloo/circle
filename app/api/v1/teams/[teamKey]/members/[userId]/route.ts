import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { listTeamMembers, removeTeamMember } from '@/lib/api/teams';
import { getOrCreateUser } from '@/lib/api/users';
import { recordAudit } from '@/lib/api/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string; userId: string }> };

/** DELETE /teams/{teamKey}/members/{userId} — remove um membro do time. */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey, userId } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db)))
         throw new ApiError(403, 'Apenas administradores podem remover membros');
      await removeTeamMember(db, teamKey, userId);
      const actor = await getOrCreateUser(db, email);
      await recordAudit(db, {
         actorId: actor.id,
         action: 'member.remove',
         targetType: 'team',
         targetId: teamKey,
         meta: { userId },
      });
      return ok(await listTeamMembers(db, teamKey));
   }, req);
}
