import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { deleteInitiativeUpdate, editInitiativeUpdate } from '@/lib/api/initiative-detail';
import type { InitiativeUpdateHealth } from '@/lib/api/initiative-detail';
import type { ContentBlock } from '@/data/issue-details';
import { assertInitiativeInScope, scopeForEmail } from '@/lib/api/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; uid: string }> };

const EditSchema = z.object({
   health: z.enum(['on-track', 'at-risk', 'off-track']).optional(),
   blocks: z.array(z.unknown()).max(500).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
   return handle(async () => {
      const { id, uid } = await params;
      const email = await requireEmail(req);
      const { teamIds } = await scopeForEmail(db, email);
      await assertInitiativeInScope(db, teamIds, id);
      const input = EditSchema.parse(await req.json());
      return ok(
         await editInitiativeUpdate(db, id, uid, {
            health: input.health as InitiativeUpdateHealth | undefined,
            blocks: input.blocks as ContentBlock[] | undefined,
         })
      );
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id, uid } = await params;
      const email = await requireEmail(req);
      const { teamIds } = await scopeForEmail(db, email);
      await assertInitiativeInScope(db, teamIds, id);
      const initiative = await deleteInitiativeUpdate(db, id, uid);
      return initiative ? ok(initiative) : notFound(`Update '${uid}' não encontrado`);
   }, req);
}
