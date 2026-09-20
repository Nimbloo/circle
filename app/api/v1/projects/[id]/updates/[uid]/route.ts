import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { deleteProjectUpdate, editProjectUpdate } from '@/lib/api/project-detail';
import type { ProjectUpdateHealth } from '@/lib/api/project-detail';
import type { ContentBlock } from '@/data/issue-details';

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
      const input = EditSchema.parse(await req.json());
      const dto = await editProjectUpdate(
         db,
         id,
         uid,
         {
            health: input.health as ProjectUpdateHealth | undefined,
            blocks: input.blocks as ContentBlock[] | undefined,
         },
         email
      );
      return ok(dto);
   }, req);
}

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id, uid } = await params;
      const email = await requireEmail(req);
      const removed = await deleteProjectUpdate(db, id, uid, email);
      return removed ? ok({ deleted: true }) : notFound(`Update '${uid}' não encontrado`);
   }, req);
}
