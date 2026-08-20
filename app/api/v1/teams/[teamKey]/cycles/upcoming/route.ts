import { db } from '@/db';
import { ok, notFound } from '@/lib/api/response';
import { handle } from '@/lib/api/http';
import { getCycleByStatus } from '@/lib/api/cycles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

export async function GET(_req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const dto = await getCycleByStatus(db, teamKey, 'upcoming');
      return dto ? ok(dto) : notFound(`Nenhum ciclo futuro no time '${teamKey}'`);
   });
}
