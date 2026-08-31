import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { listInitiativeUpdates, postInitiativeUpdate } from '@/lib/api/initiative-detail';
import type { InitiativeUpdateHealth } from '@/lib/api/initiative-detail';
import type { ContentBlock } from '@/data/issue-details';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      return ok(await listInitiativeUpdates(db, id));
   });
}

const CreateSchema = z.object({
   health: z.enum(['on-track', 'at-risk', 'off-track']),
   blocks: z.array(z.unknown()).default([]),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      const author = await getOrCreateUser(db, email);
      const dto = await postInitiativeUpdate(db, id, author.id, {
         health: input.health as InitiativeUpdateHealth,
         blocks: input.blocks as ContentBlock[],
      });
      return ok(dto);
   });
}
