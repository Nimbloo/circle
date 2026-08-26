import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { moveIssueToTeam } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const MoveSchema = z.object({ teamId: z.string().min(1).max(36) });

/** POST /issues/{id}/move-team — move a issue para outro time (reatribui identifier). */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const { teamId } = MoveSchema.parse(await req.json());
      const dto = await moveIssueToTeam(db, id, teamId);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   });
}
