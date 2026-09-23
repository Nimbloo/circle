import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { createProjectDocument } from '@/lib/api/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const CreateSchema = z.object({
   /** Segmento `[orgId]` da URL atual: compõe o link interno salvo no resource. */
   orgId: z.string().min(1).max(64),
});

/** Cria um documento no time do projeto e o vincula como resource (atômico). */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      const input = CreateSchema.parse(await req.json());
      return ok(await createProjectDocument(db, id, input, email));
   }, req);
}
