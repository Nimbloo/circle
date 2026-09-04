import { z } from 'zod';
import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { isAdmin } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { ok, notFound } from '@/lib/api/response';
import { getOrCreateUser } from '@/lib/api/users';
import { recordAudit } from '@/lib/api/audit';
import {
   deleteWebhook,
   updateWebhook,
   WEBHOOK_EVENTS,
   type WebhookEvent,
} from '@/lib/api/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
   url: z.string().min(1).max(512).optional(),
   events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
   enabled: z.boolean().optional(),
});

/** PATCH /webhooks/{id} — edita URL/eventos ou liga/desliga. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const { id } = await ctx.params;
      const body = patchSchema.parse(await req.json());
      const updated = await updateWebhook(db, id, {
         ...body,
         events: body.events as WebhookEvent[] | undefined,
      });
      return updated ? ok(updated) : notFound('Webhook não encontrado');
   }, req);
}

/** DELETE /webhooks/{id} — remove o webhook e as entregas dele. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
   return handle(async () => {
      const email = await requireEmail(req);
      if (!(await isAdmin(email, db))) throw new ApiError(403, 'Apenas admin');
      const { id } = await ctx.params;
      if (!(await deleteWebhook(db, id))) return notFound('Webhook não encontrado');
      const actor = await getOrCreateUser(db, email);
      await recordAudit(db, {
         actorId: actor.id,
         action: 'webhook.delete',
         targetType: 'webhook',
         targetId: id,
      });
      return ok({ deleted: true });
   }, req);
}
