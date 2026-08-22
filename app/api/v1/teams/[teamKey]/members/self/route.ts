import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { removeTeamMember, listTeamMembers } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

/** DELETE /teams/{teamKey}/members/self — o usuário atual SAI do time (self-service). */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = await requireEmail(req);
      const me = await getOrCreateUser(db, email);
      await removeTeamMember(db, teamKey, me.id);
      return ok(await listTeamMembers(db, teamKey));
   });
}
