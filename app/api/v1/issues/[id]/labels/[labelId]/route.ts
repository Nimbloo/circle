import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { removeLabel } from '@/lib/api/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; labelId: string }> };

export async function DELETE(req: Request, { params }: Params) {
   return handle(async () => {
      const { id, labelId } = await params;
      const email = await requireEmail(req);
      const dto = await removeLabel(db, id, labelId, email);
      return dto ? ok(dto) : notFound(`Issue '${id}' não encontrada`);
   });
}
