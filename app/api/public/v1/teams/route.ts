import { db } from '@/db';
import { handle } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { requireApiToken } from '@/lib/api/public-auth';
import { listTeams } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/public/v1/teams — times visíveis ao dono do token (escopo `read`). */
export async function GET(req: Request) {
   return handle(async () => {
      const ctx = await requireApiToken(db, req, 'read');
      return ok(await listTeams(db, { teamIds: ctx.teamIds ?? undefined }, ctx.user.id));
   }, req);
}
