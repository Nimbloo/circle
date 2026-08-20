import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listTeamMembers, removeTeamMember } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string; userId: string }> };

/** DELETE /teams/{teamKey}/members/{userId} — remove um membro do time. */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey, userId } = await params;
      requireEmail(req);
      await removeTeamMember(db, teamKey, userId);
      return ok(await listTeamMembers(db, teamKey));
   });
}
