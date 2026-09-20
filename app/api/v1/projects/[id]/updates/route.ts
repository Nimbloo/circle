import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getOrCreateUser } from '@/lib/api/users';
import { listUpdates, postProjectUpdate } from '@/lib/api/project-detail';
import type { ProjectUpdateHealth } from '@/lib/api/project-detail';
import type { ContentBlock } from '@/data/issue-details';
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
      const rawLimit = Number(new URL(req.url).searchParams.get('limit'));
      const limit =
         Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.floor(rawLimit), 200)
            : undefined;
      return ok(await listUpdates(db, id, limit));
   }, req);
}

const CreateSchema = z.object({
   health: z.enum(['on-track', 'at-risk', 'off-track']),
   // Teto de blocos por update (texto livre do composer; evita payload gigante).
   blocks: z.array(z.unknown()).max(500).default([]),
});

export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      const author = await getOrCreateUser(db, email);
      const dto = await postProjectUpdate(
         db,
         id,
         author.id,
         {
            health: input.health as ProjectUpdateHealth,
            blocks: input.blocks as ContentBlock[],
         },
         email
      );
      return ok(dto);
   }, req);
}
