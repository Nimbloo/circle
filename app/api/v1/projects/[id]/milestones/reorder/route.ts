import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { reorderMilestones } from '@/lib/api/project-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const ReorderSchema = z.object({
   orderedIds: z.array(z.string()).min(1),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      await requireEmail(req);
      const { orderedIds } = ReorderSchema.parse(await req.json());
      return ok(await reorderMilestones(db, id, orderedIds));
   });
}
