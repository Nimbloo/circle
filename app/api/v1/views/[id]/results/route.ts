import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle } from '@/lib/api/http';
import { resolveView } from '@/lib/api/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { id } = await params;
      const res = await resolveView(db, id);
      return res ? ok(res) : notFound(`View '${id}' não encontrada`);
   });
}
