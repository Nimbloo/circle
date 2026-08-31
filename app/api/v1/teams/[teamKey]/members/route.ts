import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { listTeamMembers, addTeamMember } from '@/lib/api/teams';
import { getOrCreateUser } from '@/lib/api/users';
import { recordAudit } from '@/lib/api/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { teamKey } = await params;
      return ok(await listTeamMembers(db, teamKey));
   });
}

const AddMemberSchema = z.object({ email: z.string().email() });

/** POST /teams/{teamKey}/members — adiciona um membro pelo e-mail (provisiona se novo). */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const actor = await requireEmail(req);
      if (!(await isAdmin(actor, db))) throw new ApiError(403, 'Apenas admin');
      const { email } = AddMemberSchema.parse(await req.json());
      await addTeamMember(db, teamKey, email);
      const actorUser = await getOrCreateUser(db, actor);
      await recordAudit(db, {
         actorId: actorUser.id,
         action: 'member.add',
         targetType: 'team',
         targetId: teamKey,
         meta: { email },
      });
      return ok(await listTeamMembers(db, teamKey));
   });
}
