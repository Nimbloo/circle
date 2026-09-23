import { z } from 'zod';
import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { setReviewFileState } from '@/lib/api/review-file-states';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; path: string[] }> };

const BodySchema = z.object({ reviewed: z.boolean() });

/**
 * PUT /reviews/{id}/file-states/{path} — marca/desmarca o arquivo como revisado
 * (escopo do usuário autenticado). `path` é catch-all: caminhos de arquivo têm '/'.
 */
export async function PUT(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id, path } = await params;
      const { reviewed } = BodySchema.parse(await req.json());
      const result = await setReviewFileState(
         db,
         decodeURIComponent(id),
         email,
         path.join('/'),
         reviewed
      );
      return ok(result);
   }, req);
}
