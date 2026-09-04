import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { resolveView } from '@/lib/api/views';
import { visibleTeamIds } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const me = await getOrCreateUser(db, await requireEmail(req));
      const teamIds = await visibleTeamIds(db, me);
      // view pessoal só p/ o dono; guest só enxerga as dos seus times (#100)
      const res = await resolveView(db, id, me.id, teamIds ?? undefined);
      return res ? ok(res) : notFound(`View '${id}' não encontrada`);
   }, req);
}
