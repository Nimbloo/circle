import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { ok } from '@/lib/api/response';
import { redeliver } from '@/lib/api/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /webhooks/deliveries/{deliveryId}/redeliver — reenvia a entrega agora. */
export async function POST(req: Request, ctx: { params: Promise<{ deliveryId: string }> }) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const { deliveryId } = await ctx.params;
      return ok(await redeliver(db, deliveryId));
   }, req);
}
