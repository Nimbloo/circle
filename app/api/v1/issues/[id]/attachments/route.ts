import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { listIssueAttachments } from '@/lib/api/attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** GET /issues/:id/attachments — anexos da issue (os de comentário vêm no feed). */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      return ok(await listIssueAttachments(db, id));
   }, req);
}
