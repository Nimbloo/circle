import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle } from '@/lib/api/http';
import { getInitiativeProjects } from '@/lib/api/initiatives';
import { listProjects } from '@/lib/api/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const projectIds = new Set(await getInitiativeProjects(db, id));
      const all = await listProjects(db, {});
      return ok(all.filter((p) => projectIds.has(p.id)));
   });
}
