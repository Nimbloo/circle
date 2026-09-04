import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { listInitiativeUpdates, postInitiativeUpdate } from '@/lib/api/initiative-detail';
import type { InitiativeUpdateHealth } from '@/lib/api/initiative-detail';
import type { ContentBlock } from '@/data/issue-details';
import { assertInitiativeInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const { teamIds } = await scopeForEmail(db, email);
      await assertInitiativeInScope(db, teamIds, id);
      return ok(await listInitiativeUpdates(db, id));
   }, req);
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
      const { teamIds } = await scopeForEmail(db, email);
      await assertInitiativeInScope(db, teamIds, id);
      const author = await getOrCreateUser(db, email);
      // Devolve `{ update, initiative }` — a initiative já com o health propagado.
      const result = await postInitiativeUpdate(db, id, author.id, {
         health: input.health as InitiativeUpdateHealth,
         blocks: input.blocks as ContentBlock[],
      });
      return ok(result);
   }, req);
}
