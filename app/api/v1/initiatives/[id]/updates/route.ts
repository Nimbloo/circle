import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listInitiativeUpdates, postInitiativeUpdate } from '@/lib/api/initiatives';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      return ok(await listInitiativeUpdates(db, id));
   });
}

const PostSchema = z.object({
   health: z.enum(['on-track', 'at-risk', 'off-track']),
   blocks: z.array(z.any()).default([]),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const input = PostSchema.parse(await req.json());
      return ok(await postInitiativeUpdate(db, id, email, input));
   });
}
