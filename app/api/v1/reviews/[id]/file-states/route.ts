import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listReviewedPaths } from '@/lib/api/review-file-states';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** GET /reviews/{id}/file-states — caminhos que O USUÁRIO já marcou como revisados. */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      const email = await requireEmail(req);
      const { id } = await params;
      const paths = await listReviewedPaths(db, decodeURIComponent(id), email);
      return ok(paths);
   }, req);
}
