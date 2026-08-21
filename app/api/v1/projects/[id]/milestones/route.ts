import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listMilestones, addMilestone } from '@/lib/api/project-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      return ok(await listMilestones(db, id));
   });
}

const CreateSchema = z.object({
   name: z.string().min(1).max(196),
   targetDate: z.string().date().nullish(),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      return ok(await addMilestone(db, id, input));
   });
}
