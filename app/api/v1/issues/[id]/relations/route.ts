import { z } from 'zod';
import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { addRelation, removeRelation, RELATION_KINDS } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const RelationSchema = z.object({
   relatedId: z.string().min(1),
   kind: z.enum(RELATION_KINDS as unknown as [string, ...string[]]),
});

/** POST /issues/{id}/relations — cria relação {relatedId, kind}. */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const { relatedId, kind } = RelationSchema.parse(await req.json());
      const dto = await addRelation(db, id, relatedId, kind as (typeof RELATION_KINDS)[number]);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   });
}

/** DELETE /issues/{id}/relations?relatedId=..&kind=.. — remove a relação. */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      requireEmail(req);
      const sp = new URL(req.url).searchParams;
      const { relatedId, kind } = RelationSchema.parse({
         relatedId: sp.get('relatedId'),
         kind: sp.get('kind'),
      });
      const dto = await removeRelation(db, id, relatedId, kind as (typeof RELATION_KINDS)[number]);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   });
}
