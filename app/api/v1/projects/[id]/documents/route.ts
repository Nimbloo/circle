import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { createProjectDocument } from '@/lib/api/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Cria um documento no time do projeto e o vincula como resource (atômico). Sem corpo: o
 * link salvo é relativo ao workspace e o cliente prefixa a org da rota atual.
 */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const email = await requireEmail(req);
      return ok(await createProjectDocument(db, id, email));
   }, req);
}
