import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getCycleByStatus } from '@/lib/api/cycles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { teamKey } = await params;
      const dto = await getCycleByStatus(db, teamKey, 'current');
      return dto ? ok(dto) : notFound(`Nenhum ciclo ativo no time '${teamKey}'`);
   });
}
