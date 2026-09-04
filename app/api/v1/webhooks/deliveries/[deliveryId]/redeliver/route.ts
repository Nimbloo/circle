import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { redeliver } from '@/lib/api/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /webhooks/deliveries/{deliveryId}/redeliver — reenvia a entrega agora. */
export async function POST(req: Request, ctx: { params: Promise<{ deliveryId: string }> }) {
   return handle(async () => {
      await requireEmail(req);
      const { deliveryId } = await ctx.params;
      return ok(await redeliver(db, deliveryId));
   }, req);
}
