import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listMilestones, addMilestone } from '@/lib/api/project-detail';
import { assertProjectInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const { teamIds } = await scopeForEmail(db, email);
      await assertProjectInScope(db, teamIds, id);
      return ok(await listMilestones(db, id));
   }, req);
}

const CreateSchema = z.object({
   name: z.string().min(1).max(196),
   targetDate: z.string().date().nullish(),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      return ok(await addMilestone(db, id, input, email));
   }, req);
}
