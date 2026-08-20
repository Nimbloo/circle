import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle } from '@/lib/api/http';
import { emailFromRequest } from '@/lib/api/auth';
import { getOrCreateUser } from '@/lib/api/users';
import { getTeam } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = emailFromRequest(req);
      const meId = email ? (await getOrCreateUser(db, email)).id : undefined;
      const dto = await getTeam(db, teamKey, meId);
      return dto ? ok(dto) : notFound(`Team '${teamKey}' não encontrado`);
   });
}
