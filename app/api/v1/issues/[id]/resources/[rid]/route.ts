import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { removeIssueResource } from '@/lib/api/issue-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; rid: string }> };

/** Remove um resource da issue. */
export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { rid } = await params;
      await requireEmail(req);
      const removed = await removeIssueResource(db, rid);
      return removed ? ok({ deleted: true }) : notFound(`Resource '${rid}' não encontrado`);
   });
}
