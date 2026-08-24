import { db } from '@/db';
import { ok } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { startCycleToday } from '@/lib/api/cycles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ teamKey: string }> };

/** "Start cycle today": encerra o ciclo corrente e inicia o próximo hoje (rollover). */
export async function POST(req: Request, { params }: Params) {
   return handle(async () => {
      const { teamKey } = await params;
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      await startCycleToday(db, teamKey);
      return ok({ started: true });
   });
}
