import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, multi } from '@/lib/api/http';
import { emailFromRequest } from '@/lib/api/auth';
import { getOrCreateUser } from '@/lib/api/users';
import { listTeams, type TeamSort } from '@/lib/api/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
   return handle(async () => {
      const sp = new URL(req.url).searchParams;
      const email = emailFromRequest(req);
      const meId = email ? (await getOrCreateUser(db, email)).id : undefined;
      const [sort, dir] = (sp.get('sort') ?? 'name-asc').split('-') as [TeamSort, 'asc' | 'desc'];
      return ok(await listTeams(db, { membership: multi(sp, 'membership'), sort, dir }, meId));
   });
}
