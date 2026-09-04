import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { ok } from '@/lib/api/response';
import { listDeliveries } from '@/lib/api/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /webhooks/{id}/deliveries — últimas entregas com status, tentativas e erro. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
   return handle(async () => {
      const email = await requireEmail(req);
      // `responseCode`/`lastError` descrevem a rede de destino — só admin lê.
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const { id } = await ctx.params;
      const limit = Number(new URL(req.url).searchParams.get('limit'));
      return ok(await listDeliveries(db, id, Number.isFinite(limit) && limit > 0 ? limit : 20));
   }, req);
}
