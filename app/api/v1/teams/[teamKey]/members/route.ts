import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listTeamMembers, addTeamMember } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      return ok(await listTeamMembers(db, teamKey));
   });
}

const AddMemberSchema = z.object({ email: z.string().email() });

/** POST /teams/{teamKey}/members — adiciona um membro pelo e-mail (provisiona se novo). */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      requireEmail(req);
      const { email } = AddMemberSchema.parse(await req.json());
      await addTeamMember(db, teamKey, email);
      return ok(await listTeamMembers(db, teamKey));
   });
}
