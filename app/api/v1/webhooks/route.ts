import { z } from 'zod';
import { db } from '@/db';
import { handle, requireEmail } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { getOrCreateUser } from '@/lib/api/users';
import { recordAudit } from '@/lib/api/audit';
import {
   createWebhook,
   listWebhooks,
   sweepWebhookDeliveries,
   WEBHOOK_EVENTS,
   type WebhookEvent,
} from '@/lib/api/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
   url: z.string().min(1).max(512),
   events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
   secret: z.string().max(128).optional(),
});

/** GET /webhooks — lista os webhooks (sem o segredo). */
export async function GET(req: Request) {
   return handle(async () => {
      await requireEmail(req);
      // Sweep lazy das entregas pendentes (o boot NÃO faz isto: importar webhooks a
      // partir do instrumentation arrasta o cliente Postgres para o bundle Edge).
      // Best-effort: a lista responde mesmo se o reprocessamento falhar.
      void sweepWebhookDeliveries(db).catch(() => undefined);
      return ok(await listWebhooks(db));
   }, req);
}

/** POST /webhooks — cria; devolve o segredo UMA vez (para configurar no receptor). */
export async function POST(req: Request) {
   return handle(async () => {
      const email = await requireEmail(req);
      const body = createSchema.parse(await req.json());
      const actor = await getOrCreateUser(db, email);
      const created = await createWebhook(
         db,
         { url: body.url, events: body.events as WebhookEvent[], secret: body.secret },
         actor.id
      );
      await recordAudit(db, {
         actorId: actor.id,
         action: 'webhook.create',
         targetType: 'webhook',
         targetId: created.id,
         meta: { url: created.url, events: created.events },
      });
      return ok(created);
   }, req);
}
